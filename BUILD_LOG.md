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
