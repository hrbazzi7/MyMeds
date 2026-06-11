# MyMeds Build Log

## Phase 1 — Foundation (2026-06-10)

### What was built
- Next.js 15.5.19 project with TypeScript strict mode, Tailwind CSS v3, App Router
- Folder structure: `/app`, `/components` (empty, populated in later phases), `/lib`, `/types`, `/supabase`, `/public`
- `lib/supabase/server.ts` — service-role Supabase client; bypasses RLS; called only from Server Actions
- `lib/twilio.ts` — Twilio service wrapper: `sendSms` (outbound SMS) and `validateWebhookSignature` (inbound webhook validation)
- `.env.example` with all eight required environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_PHONE`, `CRON_SECRET`, `TWILIO_WEBHOOK_SECRET`
- `npm run lint` — passes with zero warnings or errors
- `npm run build` — passes cleanly; one static route (`/`)

### Dependencies added (beyond spec stack)
- `@eslint/eslintrc` — required by Next.js 15's flat ESLint config format (`eslint.config.mjs` + `FlatCompat`). No functional impact; pure tooling.

### Decisions
- Used `@supabase/supabase-js` directly (not `@supabase/ssr`). `@supabase/ssr` is for cookie-based authenticated sessions; this project uses a service-role client server-side only. No cookie handling needed.
- `next.config.ts` marks `twilio` as a `serverExternalPackage` so Next.js does not attempt to bundle it for the edge runtime.
- `jsPDF` installed but not imported; client-side PDF generation is Phase 7.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is present in `.env.example` per spec even though this project never uses the anon key (all access is service-role via Server Actions). It is retained for Supabase project introspection and potential future use.

### Assumptions
- PostgreSQL `gen_random_uuid()` is available (Supabase runs PostgreSQL 15+, where it is built-in).
- Twilio SDK v5 exports `validateRequest` as a property on its default export (`twilio.validateRequest`). If this produces a TypeScript error when Phase 5 is implemented, the import will be changed to `import { validateRequest } from 'twilio/lib/webhooks/webhooks'`.

### Known gaps / deferred
- No `.env.local` — developer must copy `.env.example` and fill in real credentials before running locally.
- `app/page.tsx` is a placeholder; replaced by the dashboard in Phase 6.
- `next lint` prints a deprecation notice for `next lint` CLI in Next.js 16; it passes cleanly otherwise and is not actionable for this project.
- `npm audit` reports 4 vulnerabilities (3 moderate, 1 critical) in transitive dependencies. None are in first-party code; deferred to a dependency update pass before any production deployment.

---

## Phase 2 — Database (2026-06-10)

### What was built
- `supabase/migrations/20260610000000_initial_schema.sql` — full PostgreSQL schema migration
- `types/index.ts` — single source of truth for all TypeScript types and enum union types
- `types/database.ts` — Supabase `Database` generic type, importing row types from `types/index.ts`

### Schema decisions
- Five PostgreSQL custom enum types created: `assessment_status`, `risk_outcome`, `refill_disposition`, `alert_severity`, `audit_action`. Values match the spec exactly.
- `assessment_status` values: `pending | in_progress | needs_review | completed | manual_call_required` (from Resolved Design Decisions).
- `risk_outcome` values: `auto_approved | logged | flagged | clinical_hold`.
- `refill_disposition` values: `approved | pending_review | held | declined_by_patient`.
- `audit_action` values: all 15 actions listed in the spec.
- `assessments.pain_score` has a `CHECK (pain_score >= 0 AND pain_score <= 10)` constraint.
- `audit_logs.assessment_id` is nullable (`REFERENCES assessments(id) ON DELETE SET NULL`) because some audit events (e.g., `sms_sent` for a freshly created assessment that later fails) may not have a committed assessment row, or the assessment could be deleted while preserving the patient audit trail.
- `refill_confirmed` and `delivery_approved` are explicit `BOOLEAN` columns on `assessments` as called out in the spec.

### RLS
- RLS enabled on all five tables.
- Single `deny_all` policy per table targeting `anon, authenticated` roles with `USING (false) WITH CHECK (false)`. Service role bypasses RLS entirely; no permissive policies are needed.
- Explicit policy names follow the convention `"deny_all"` on each table.

### Indexes
- `assessment_tokens.token` — unique constraint + explicit index for O(1) token lookups on every patient request.
- `assessments.patient_id`, `alerts.patient_id`, `alerts.assessment_id`, `assessment_tokens.assessment_id`, `audit_logs.patient_id`, `audit_logs.assessment_id` — foreign-key indexes for join performance.

### Assumptions
- Supabase's encryption at rest satisfies the storage-encryption requirement (per spec: "do not build custom encryption").
- `patients.phone` stored as `TEXT` in E.164 format. Normalization happens at import time (Phase 6 CSV upload); no DB-level format constraint added to allow corrections without a migration.

### Schema deviation — `audit_action` enum renamed *(RESOLVED — see pre-Phase 3 entry)*
- **Was:** enum type `assessment_audit_action` on the shared Pharmacy Project (naming collision with co-resident app).
- **Resolved:** MyMeds moved to its own dedicated project; enum reverted to spec-correct `audit_action`.
- `types/database.ts` mapping reverted: `audit_action: AuditAction`.

### Known gaps / deferred
- Seed script (30–50 patients spanning every status and outcome) is deferred to Phase 6.
- `supabase/config.toml` created. The Supabase CLI's `supabase link` had a bug (failed with `AlreadyExists` on `.temp/` when the directory existed from a prior run). Fixed by removing the stale `.temp` directory before re-linking. Migration was originally applied via the Management API; re-applied cleanly via `supabase db push` on the dedicated project.

---

## Phase 2 — DB Verification (2026-06-10)

Remote project: **Pharmacy Project** (`pdojqpnrilanpzpumdku`, East US / North Virginia)  
Migration applied: `20260610000000_initial_schema.sql` via Management API.  
Verification script: `scripts/verify-db.ts` (excluded from Next.js build via `tsconfig.json` `exclude`).

### Verification results — all 23 checks passed

**Section 1 — Service-role SELECT on all 5 tables**
- ✓ `patients` — queryable via service-role client
- ✓ `assessments` — queryable via service-role client
- ✓ `alerts` — queryable via service-role client
- ✓ `assessment_tokens` — queryable via service-role client
- ✓ `audit_logs` — queryable via service-role client

**Section 2 — Service-role INSERT + read**
- ✓ INSERT of a test patient succeeded
- ✓ Returned row has a valid UUID `id`
- ✓ Service-role SELECT of own row returned correct `full_name`

**Section 3 — RLS enforcement**
- ✓ Anon-key SELECT returns **0 rows** (deny-all `USING(false)` hides all rows)
- ✓ Anon-key INSERT is **rejected** (deny-all `WITH CHECK(false)` blocks writes)

**Section 4 — Enum values**
- ✓ `assessment_status`: all 5 values accepted (`pending`, `in_progress`, `needs_review`, `completed`, `manual_call_required`)
- ✓ Invalid status value `not_a_valid_status` → PostgreSQL error `22P02: invalid input value for enum assessment_status`
- ✓ `risk_outcome` + `refill_disposition`: `auto_approved` / `approved` accepted
- ✓ `alert_severity`: `flag` and `hold` both accepted
- ✓ `assessment_audit_action`: `sms_sent`, `dob_verified`, `pdf_generated`, `manual_call_flagged` all accepted

**Section 5 — Cleanup**
- ✓ Test patient and all cascaded rows deleted cleanly

### Post-verification build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully (`scripts/` excluded from tsconfig `exclude` list to prevent tsx-only verification script from being compiled by Next.js)

---

## Pre-Phase 3 — Project migration + enum revert (2026-06-10)

### What changed

**New dedicated Supabase project created**
- Project ref: `liqrfxmmduniixotwaky` — "MyMeds", us-east-1 (East US / North Virginia)
- Reason: the old "Pharmacy Project" (`pdojqpnrilanpzpumdku`) was a shared instance containing a co-resident mobile app, which caused the `audit_action` enum naming collision documented in Phase 2.
- Created via the Supabase Management API (CLI `supabase projects create` syntax also valid but deferred to avoid interactive prompts).

**`audit_action` enum name reverted to spec**
- `supabase/migrations/20260610000000_initial_schema.sql` — `assessment_audit_action` → `audit_action`.
- `types/database.ts` Enums mapping — `assessment_audit_action` → `audit_action`.
- No changes to `types/index.ts` (TypeScript `AuditAction` union type was never affected).
- Phase 2 deviation entry in BUILD_LOG.md updated to "RESOLVED".

**`.env.example` — unchanged; all 8 spec-mandated variables still present.**

**Supabase CLI link bug — fixed**
- Root cause: `supabase link` fails with `AlreadyExists` if `supabase/.temp` already exists from a prior run.
- Fix: `Remove-Item -Recurse -Force supabase\.temp` before re-running `supabase link`.
- `supabase config.toml` `project_id` updated to `liqrfxmmduniixotwaky`.
- `supabase link --project-ref liqrfxmmduniixotwaky --password <db_pass>` succeeded.
- `supabase db push` applied the migration and recorded it in `supabase_migrations.schema_migrations` — future migrations will not conflict.

**`scripts/verify-db.ts` — made idempotent**
- Added pre-run cleanup: `DELETE FROM patients WHERE full_name = '__verify_test__'` runs before any inserts so interrupted previous runs leave no stale data.
- Post-run verification confirms 0 rows remain with `full_name = '__verify_test__'`.
- Bad enum value check added (checks for PostgreSQL `22P02` error on invalid status).
- Stale comment referencing `assessment_audit_action` removed; all references now say `audit_action`.

### Verification results — 25/25 passed (run twice; idempotency confirmed)
- ✓ Service-role SELECT on all 5 tables
- ✓ Service-role INSERT + SELECT (UUID, full_name round-trip)
- ✓ Anon-key SELECT → 0 rows (RLS deny-all USING false)
- ✓ Anon-key INSERT → rejected (RLS deny-all WITH CHECK false)
- ✓ All 5 `assessment_status` values accepted by DB
- ✓ `risk_outcome` + `refill_disposition` accepted
- ✓ `alert_severity` flag + hold accepted
- ✓ `audit_action` sms_sent, dob_verified, pdf_generated, manual_call_flagged accepted
- ✓ Invalid status value → PostgreSQL error `22P02`
- ✓ All test rows deleted; 0 rows remain

### Build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully

---

## Phase 3 — Patient Assessment Workflow (2026-06-10)

### What was built

**Route: `app/assess/[token]/page.tsx`** (Server Component)
- Token validation on every request: must exist, unused, unexpired
- Invalid/expired/used token → `InvalidToken` component ("link no longer available")
- First valid open: sets `opened_at`, status → `in_progress`, logs `assessment_opened`
- Passes `assessmentId` + `tokenId` to `AssessmentFlow` client component; no PHI in props

**Server Actions: `app/assess/[token]/actions.ts`**
- `verifyDob(assessmentId, dob)`: re-validates assessment exists; counts `dob_failed` audit logs as the server-side attempt counter; returns generic error on mismatch (never confirms whether a record exists); on 5th failure marks token `used = true`, status → `manual_call_required`, returns `locked: true`; on success logs `dob_verified` + `assessment_started`
- `submitAssessment(assessmentId, tokenId, answers)`: re-validates token is still valid before writing; saves all 9 answer fields; sets `submitted_at = now()`; sets `status = 'needs_review'` (rules engine deferred to Phase 4 per spec); marks token `used = true`; logs `assessment_submitted`

**Client Component: `components/assess/AssessmentFlow.tsx`**
- All 4 screens managed via React `useState` (no PHI in URLs, no PHI in client storage, in-memory only)
- Screen 1 → 2 advance gated on successful `verifyDob` server action
- Screens 2–3 advance on "Continue" once all questions answered
- Screen 4 submit gated on both refill confirmation questions answered
- Edit-from-review: "Edit" buttons on Screen 4 set screen state back to 2 or 3; existing answers preserved

**Screen components:**
- `Screen1Dob`: `<input type="date">` (native date picker for older users; avoids typed input); `useTransition` for pending state; shows error on failure, disables form on lockout
- `Screen2Adherence`: three Yes/No large-button questions (missed_doses, medication_changes, surgery_upcoming); selected Yes highlighted amber, No highlighted green; 56px touch targets
- `Screen3Symptoms`: 0–10 pain score as 11 tap-target buttons (64×64px, color-coded green/amber/red); Fever / Active Infection / Pregnancy / None checklist; None is mutually exclusive — selecting None clears all others, selecting any symptom clears None; enforced in `toggleSymptom`
- `Screen4Review`: review cards for Adherence + Symptoms with Edit links; two Yes/No refill confirmation questions (`refill_confirmed`, `delivery_approved`); Submit calls `submitAssessment` Server Action

**`components/assess/InvalidToken.tsx`**: neutral "link no longer available" page; no pharmacy-specific PHI; instructs patient to call

### Schema fix: `types/database.ts`
- Added `Relationships: []` to each table definition and `Views`/`Functions` to schema — required by `@supabase/postgrest-js` ≥ 2.x for TypeScript type inference. Without these, `.insert()` resolved to `never[]`. No runtime or migration impact; compile-time type fix only.

### Audit actions logged per step
| Trigger | Action(s) |
|---|---|
| First valid page load | `assessment_opened` |
| DOB mismatch | `dob_failed` |
| DOB correct | `dob_verified`, `assessment_started` |
| 5th DOB failure | `dob_failed` (5th), token invalidated, status → `manual_call_required` |
| Assessment submit | `assessment_submitted` |

### Phase 4 handoff note
`submitAssessment` sets `status = 'needs_review'` unconditionally. The clinical rules engine (Phase 4) is the only thing that should ever set `status = 'completed'`, `risk_outcome`, `refill_disposition`, or create alerts. No auto-completion logic exists in Phase 3 — this is intentional per spec.

### Design constraints honored
- Mobile-first, `max-w-sm` card on `bg-gray-50`; looks correct at ~375px
- All buttons `min-h-[52px]` or `min-h-[56px]` (≥44px); pain score buttons 64×64px
- DOB is the only typed input; all other inputs are tap targets
- No PHI in URLs (screen nav is React state, not URL params)
- No PHI in console or client storage (React in-memory state only)
- `verifyDob` generic error message never confirms a patient record exists

### Verification
- `scripts/setup-test-token.ts` creates test patient (DOB 1975-03-22) + assessment + 96h token
- `scripts/test-phase3-actions.ts` — 18/18 checks passed:
  - `assessment_opened` logged on first page load; `opened_at` and `status = in_progress` set
  - DOB failure increments `dob_failed` counter
  - DOB success logs `dob_verified` + `assessment_started`
  - Lockout at 5 failures: token `used = true`, status `manual_call_required`
  - Submit saves all 9 answer fields, sets `submitted_at`, `status = needs_review`, token `used = true`, logs `assessment_submitted`
- Invalid token URL → "This link is no longer available" page (verified via curl)
- Valid token URL → "Verify Your Identity" DOB screen (verified via curl)

### Build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully; `/assess/[token]` is dynamic server-rendered

---

## Phase 3 — Spec v0.3 Amendment (2026-06-10)

### Changes applied

Spec was updated from v0.2 to v0.3 after Phase 3 was built. The following brings the codebase into alignment; Phase 4+ features were not pre-built.

### Migration: `20260610000001_v03_amendments.sql`

Applied via `supabase db push`. Recorded in `supabase_migrations.schema_migrations` as timestamp `20260610000001`.

```sql
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS sms_consent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opted_out boolean NOT NULL DEFAULT false;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS hospitalized       boolean,
  ADD COLUMN IF NOT EXISTS recent_vaccination  boolean,
  ADD COLUMN IF NOT EXISTS attested_by         text,
  ADD COLUMN IF NOT EXISTS attested_at         timestamptz;

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'sms_opted_out';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'assessment_attested';
```

**`sms_consent DEFAULT false`:** The spec declares this `NOT NULL` without a column default (consent is always provided at CSV import). A migration-time DEFAULT false is required to add the column to an existing table without breaking existing rows. The default value is accurate for existing test data (no real patients yet). Phase 6 CSV import will set this explicitly on every insert.

**`ALTER TYPE ADD VALUE` and transactions:** PostgreSQL 12+ allows `ALTER TYPE ADD VALUE` inside a transaction block, but the new values are not visible until the transaction commits. Since neither `sms_opted_out` nor `assessment_attested` is used in the same migration, running inside Supabase's default transaction is safe. No `-- supabase-no-tx` annotation needed.

### Types updated

**`types/index.ts`:**
- `Patient`: added `sms_consent: boolean`, `sms_opted_out: boolean`
- `Assessment`: added `hospitalized: boolean | null`, `recent_vaccination: boolean | null`, `attested_by: string | null`, `attested_at: string | null`
- `AuditAction`: added `'sms_opted_out'` and `'assessment_attested'` → 17 actions total

**`types/database.ts`:**
- `patients` Insert: `sms_opted_out` moved to optional (has DB default); `sms_consent` remains required
- `assessments` Row automatically picks up new fields from updated `Assessment` type

### Patient flow updated

**`components/assess/Screen2Adherence.tsx`**: 3 → 5 Yes/No questions, in spec order:
1. Missed doses
2. New medications
3. **Hospitalized or ER visit** (new)
4. **Recent / upcoming vaccination** (new)
5. Upcoming surgery

Spec decision (Resolved): "five Yes/No questions as stacked large-button cards (scroll permitted); five taps under 90 seconds." Same large-button card layout; scroll naturally available on the page.

**`components/assess/AssessmentFlow.tsx`**: `AdherenceState` + initial state + `reviewAnswers` extended with `hospitalized` and `recent_vaccination`.

**`components/assess/Screen4Review.tsx`**: Two new `ReviewRow` entries in the Adherence review card — "Hospitalized / ER visit" and "Recent / upcoming vaccination". Submit call updated to pass all 11 answer fields.

**`app/assess/[token]/actions.ts`**: `AssessmentAnswers` type extended; `submitAssessment` update payload includes `hospitalized` and `recent_vaccination`.

### Scripts updated

**`scripts/verify-db.ts`**: Extended with 12 new checks — new enum values, column existence, default values, and read/write round-trips. Total: 36/36 passed.

**`scripts/setup-test-token.ts`**: Patient insert now includes `sms_consent: true` (required NOT NULL column).

### Verification

- `verify-db.ts` — **36/36 checks passed**
  - `audit_action 'sms_opted_out'` and `'assessment_attested'` accepted by DB
  - `patients.sms_consent` column exists, boolean type
  - `patients.sms_opted_out` column exists, defaults to false
  - `assessments.hospitalized`, `recent_vaccination`, `attested_by`, `attested_at` columns exist
  - `hospitalized=true`, `recent_vaccination=false` round-trip correctly
- Submit with 11 fields (including `hospitalized=true`, `recent_vaccination=true`) saves and reads back correctly
- Valid token URL → HTTP 200, DOB screen renders
- Migration `20260610000001` confirmed in remote migration history

### Build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully

---

## Phase 4 — Clinical Rules Engine (2026-06-10)

### What was built

**`lib/rules.ts`** — pure synchronous function, no async, no DB calls.

- `evaluateRules(input: RulesInput): RulesResult` implements spec precedence exactly: CLINICAL HOLD > FLAGGED > LOGGED > AUTO-APPROVED (first match wins).
- Hold triggers (any one sufficient): `fever`, `infection`, `pregnancy_status`, `surgery_upcoming` → `clinical_hold / held / needs_review / hold alert`
- Flag triggers (any one sufficient): `pain_score ≥ 7`, `missed_doses`, `medication_changes`, `hospitalized`, `recent_vaccination` → `flagged / pending_review / needs_review / flag alert`
- Logged (mutually exclusive with above): `pain_score 4–6` → `logged / approved / completed / null alert`
- Auto-approved: all clear → `auto_approved / approved / completed / null alert`
- Post-evaluation overrides applied after base outcome: `refill_confirmed = false` → `refill_disposition = declined_by_patient, status = manual_call_required`; `delivery_approved = false` → `status = manual_call_required`. Both can apply to any outcome including holds and flags.
- `escalation_reason` is a human-readable comma-separated list of all triggered conditions (empty string for auto_approved).
- Uses relative import `../types/index` (not `@/` alias) so the module resolves correctly when compiled by `tsx` for the test script.

**`scripts/test-rules.ts`** — 17 test cases using `node:assert/strict` only (no test framework per CLAUDE_RULES.md).

| # | Case | Expected |
|---|------|----------|
| 1 | fever | clinical_hold, held, needs_review, hold |
| 2 | infection | clinical_hold, held, needs_review, hold |
| 3 | pregnancy_status | clinical_hold, held, needs_review, hold |
| 4 | surgery_upcoming | clinical_hold, held, needs_review, hold |
| 5 | pain_score=7 | flagged, pending_review, needs_review, flag |
| 6 | missed_doses | flagged, pending_review, needs_review, flag |
| 7 | medication_changes | flagged, pending_review, needs_review, flag |
| 8 | hospitalized | flagged, pending_review, needs_review, flag |
| 9 | recent_vaccination | flagged (not hold) |
| 10 | pain=3 | auto_approved, approved, completed, null |
| 11 | pain=4 | logged, approved, completed, null |
| 12 | pain=6 | logged, approved, completed, null |
| 13 | pain=7 | flagged, not logged |
| 14 | fever + pain=8 | clinical_hold (hold beats flag) |
| 15 | refill_confirmed=false, clean | auto_approved base + declined_by_patient + manual_call_required |
| 16 | surgery_upcoming + delivery_approved=false | clinical_hold + held + manual_call_required |
| 17 | all-clear | auto_approved, approved, completed, null, empty reason |

**Test run: 17/17 passed** (`npm run test:rules`)

**`app/assess/[token]/actions.ts`** — `submitAssessment` updated:

- Imports `evaluateRules` via relative path `../../../lib/rules`
- Calls `evaluateRules(answers)` after token and assessment re-validation
- Assessment `UPDATE` now includes all rules outcomes: `risk_outcome`, `refill_disposition`, `status`; includes `completed_at = now()` when `status === "completed"`
- Creates `alerts` row when `alert_severity !== null` (hold or flag)
- Batch `audit_logs` INSERT (single round-trip):
  - Always: `assessment_submitted`, `risk_evaluated`
  - If `clinical_hold`: `clinical_hold_created`
  - If `flagged`: `alert_created`
  - If `auto_approved`: `auto_approved`
  - If `!refill_confirmed`: `manual_call_flagged`
  - If `!delivery_approved`: `manual_call_flagged`

**`package.json`** — added `"test:rules": "npx tsx scripts/test-rules.ts"`

### Build status
- `npm run test:rules` — ✓ 17/17 passed
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully

---

## Phase 5 — SMS System (2026-06-10)

### What was built

**`lib/sms.ts`** — `sendAssessmentSms(patient, tokenStr, baseUrl)`

- Eligibility guard enforced inside the function (not at call sites): returns `{ sent: false, reason: "ineligible" }` if `sms_consent = false` or `sms_opted_out = true`. This applies to all callers: dispatch, reminders, and any future manual dispatch.
- SMS body uses first name only (no PHI): `Hi ${firstName}, your monthly refill review is ready. Complete here: ${baseUrl}/assess/${tokenStr}`
- Tokens are opaque random strings — no patient ID, name, or medication in URL or body
- Delegates to `lib/twilio.ts` `sendSms`; propagates errors as `{ sent: false, reason }` without re-throwing

**`app/api/cron/daily/route.ts`** — GET handler, `dynamic = "force-dynamic"`

- Auth: `Authorization: Bearer ${CRON_SECRET}` header required; 401 on mismatch
- Base URL reconstructed from `x-forwarded-proto` + `host` headers (not hardcoded)
- **(a) Auto-dispatch** — patients with `next_refill_date = today + 7 days`:
  - Skips patients with an existing non-terminal assessment (`pending | in_progress | needs_review`)
  - Creates assessment with `status = pending`
  - If SMS ineligible: immediately sets `status = manual_call_required`, logs `manual_call_flagged`
  - If eligible: creates token (`randomBytes(48).toString("hex")`, 96h expiry), calls `sendAssessmentSms`; on success logs `sms_sent`; on failure sets `manual_call_required` + logs `manual_call_flagged`
- **(b) Reminders** — `pending | in_progress` assessments 24–72h old:
  - Day-2 reminder: age 24–48h AND `reminder_sent` count = 0
  - Day-3 reminder: age 48–72h AND `reminder_sent` count = 1
  - Re-checks SMS eligibility via `sendAssessmentSms` (eligibility guard)
  - Reuses existing unexpired+unused token; skips if no valid token (timeout handler covers escalation)
  - Logs `reminder_sent` on success
- **(c) Timeouts** — `pending | in_progress` assessments older than 72h → `manual_call_required` + `manual_call_flagged`
- Returns JSON summary: `{ ok, dispatched, manual_dispatch_required, reminders_sent, timedout, errors }`

**`app/api/twilio/status/route.ts`** — POST handler, `dynamic = "force-dynamic"`

- Parses `application/x-www-form-urlencoded` body via `req.formData()`
- Validates Twilio signature: reconstructs URL from `x-forwarded-proto` + `host` headers; calls `validateWebhookSignature(signature, url, params)` from `lib/twilio.ts`; 403 on mismatch
- Acts only on `MessageStatus = "failed" | "undelivered"`
- Looks up patient by `To` phone field (E.164)
- Finds most recent `pending | in_progress` assessment for that patient
- Updates to `manual_call_required` + inserts `sms_failed` and `manual_call_flagged` audit logs in one batch insert
- Returns 200 `{ ok: true }` for all non-failure statuses (Twilio expects 200)

### Design decisions
- Dispatch eligibility enforced in `sendAssessmentSms`, not in cron or webhook — single enforcement point per spec
- `crypto.randomBytes` used for all token generation (never `Math.random`)
- No PHI in SMS body, link URL, console output, or audit log `escalation_reason` field
- Twilio signature validation done before any DB reads — fail fast on invalid requests
- Reminder count determined from audit log `reminder_sent` entries rather than a separate counter column — avoids schema change and is idempotent

### Build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully; `/api/cron/daily` and `/api/twilio/status` both listed as dynamic server-rendered routes

---

## Phase 5 — Inbound Opt-Out Webhook + Cron Timeout Audit (2026-06-10)

### What was fixed / added

**Missing deliverable: `app/api/twilio/inbound/route.ts`** — POST handler, `dynamic = "force-dynamic"`

- Parses `application/x-www-form-urlencoded` body via `req.formData()`
- Validates Twilio signature before any DB access: reconstructs URL from `x-forwarded-proto` + `host`; 403 on mismatch
- Normalizes inbound body: `.trim().toUpperCase()` then tests against `Set(["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT"])`
- Unrecognized body → 200 `{ ok: true }`, no action
- On opt-out keyword:
  1. Looks up patient by `From` phone (E.164 match)
  2. Sets `patients.sms_opted_out = true`
  3. Inserts `sms_opted_out` audit log (`assessment_id` omitted — nullable column, no assessment context for a carrier-level reply)
  4. Finds all `pending | in_progress` assessments for that patient
  5. For each: sets `status = manual_call_required`, inserts `manual_call_flagged` audit log
- Unknown `From` phone → 200, no action (Twilio already enforces the opt-out at carrier level; MyMeds state update is opportunistic)

### Cron timeout ordering — verified correct, no code change

Concern: could the timeout fire before the day-3 reminder has a chance to run?

Analysis: The two Postgres queries are mutually exclusive on the 72h boundary:
- Reminder window: `gte("created_at", cutoff72h)` — assessments `created_at >= now − 72h` (inclusive)
- Timeout window:  `lt("created_at",  cutoff72h)` — assessments `created_at <  now − 72h` (exclusive)

An assessment created exactly 72h ago satisfies `>=` (reminder window) but not `<` (timeout window). It receives a day-3 reminder in section (b); the timeout check in section (c) of the same run does not match it. The timeout fires for that assessment on the *next* cron run (~T+96h). Reminder section always runs before timeout section within the same run.

Concrete trace (daily cron, assessment created at T+0):
| Run | Age | Section (b) | Section (c) |
|-----|-----|-------------|-------------|
| T+24h | 24h | isDay2 = TRUE → reminder 1 | age < 72h → no timeout |
| T+48h | 48h | isDay3 = TRUE (count=1) → reminder 2 | age < 72h → no timeout |
| T+72h | 72h | age=72h, count=2 → neither isDay2 nor isDay3 | age = 72h, `lt` = FALSE → no timeout |
| T+96h | 96h | age > 72h, not in reminder window | age > 72h, `lt` = TRUE → **timeout** |

The spec's "after day 3 → manual_call_required" is satisfied: timeout fires at T+96h, strictly after the day-3 reminder window (T+48h–T+72h). No code change required.

### Build status
- `npm run lint` — ✓ zero warnings or errors
- `npm run build` — ✓ compiled successfully; `/api/twilio/inbound` now appears as a dynamic route alongside `/api/twilio/status` and `/api/cron/daily`
