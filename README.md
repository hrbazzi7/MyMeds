# MyMeds — Specialty Pharmacy Clinical Workflow Platform

> Replacing manual pharmacist phone calls with a secure, SMS-based patient assessment system built for specialty pharmacy operations.

![Dashboard](screenshots/dashboard.png)

---

## What It Does

Specialty pharmacies are required to conduct monthly clinical assessments for patients on high-risk biologics like Enbrel or Humira. Today, that means a technician calls each patient, asks a set of clinical questions, manually documents the answers, and routes anything concerning to a pharmacist. It takes 15–20 minutes per patient, every month.

MyMeds automates that workflow:

1. **7 days before a patient's refill**, the system automatically dispatches a secure SMS link
2. **The patient taps through a 90-second assessment** on their phone — no app download, no login, just date-of-birth verification
3. **A clinical rules engine scores the response** and routes it to the right outcome instantly
4. **The pharmacist only sees flagged or held cases** — clean assessments are batch-attested in minutes
5. **Every interaction is audit-logged** and exportable as a signed PDF report

Worst case: the system handles nothing and technicians call the same patients they would have called anyway. Best case: 70%+ of patients self-complete and assessment labor drops dramatically.

---

## Screenshots

| Patient SMS Flow | Pharmacist Dashboard |
|---|---|
| ![SMS Flow](screenshots/sms-flow.png) | ![Dashboard](screenshots/dashboard.png) |

| Escalation Queue | Audit PDF |
|---|---|
| ![Escalation](screenshots/escalation.png) | ![PDF](screenshots/pdf.png) |

> **To add screenshots:** drop your images into a `/screenshots` folder in the repo root and they'll appear above automatically.

---

## Clinical Rules Engine

The core of the system is a deterministic rules engine with four risk tiers:

| Outcome | Trigger | Action |
|---|---|---|
| **Auto-Approved** | No flags raised | Refill approved, queued for batch attestation |
| **Logged** | Mild symptoms (pain 4–6, no other issues) | Approved with clinical note on PDF |
| **Flagged** | Missed doses, new medications, hospitalization, vaccination | Pharmacist review required |
| **Clinical Hold** | Fever, active infection, pregnancy, pre-surgical state | Refill blocked, pharmacist must resolve |

Holds take precedence over flags. Patient declining refill or delivery routes to the technician call queue. **120/120 QA checks passed. Zero unsafe auto-approvals.**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions) |
| Language | TypeScript (strict mode) |
| Database | Supabase (PostgreSQL, Row Level Security) |
| SMS | Twilio (outbound SMS, status callbacks, inbound STOP handling) |
| Styling | Tailwind CSS |
| PDF Generation | jsPDF (client-side) |
| Testing | Playwright (E2E), Node assert (rules engine unit tests) |
| Deployment | Vercel |

---

## Key Features

**Patient Flow**
- Tokenized SMS links — no login, no app install
- Date-of-birth verification with 5-attempt lockout
- Mobile-first UI with 44px+ tap targets for elderly patients
- Refill confirmation and delivery approval built into the flow
- Neutral expiry page — no PHI exposed on invalid/used tokens

**Clinical Engine**
- 4-tier risk scoring across 9 clinical scenarios
- Hospitalization, vaccination, surgery, and symptom flags
- Refill hold blocking with pharmacist resolution workflow
- Pure function architecture with 17-case unit test suite

**SMS Automation**
- Auto-dispatch at T-7 days via CRON_SECRET-protected cron route
- Day 2 and Day 3 reminder logic
- Twilio delivery failure callbacks → auto-route to call queue
- Inbound STOP/UNSUBSCRIBE webhook → immediate opt-out + call queue routing

**Pharmacist Dashboard**
- CSV patient import with per-row validation (date format, E.164 phone, consent flag)
- 7 real-time status filters: All, Pending, Completed, Needs Review, Clinical Hold, Flagged, Awaiting Attestation
- Escalation queue with clinical holds sorted above flags
- Batch pharmacist attestation (name once, sign all)
- Per-assessment PDF audit report download

**Audit & Compliance**
- 17 distinct audit event types logged (SMS dispatch through attestation)
- Deny-all RLS — all data access through server-side service role only
- No PHI in SMS bodies, URLs, logs, or client-side storage
- PDF includes patient-reported disclaimer, clinical outcome, pharmacist sign-off block

---

## Database Schema

```
patients          — demographics, consent, opt-out status
assessments       — clinical answers, risk outcome, refill disposition
assessment_tokens — single-use secure tokens with expiry
alerts            — escalation records (holds and flags)
audit_logs        — immutable event trail (17 action types)
```

All tables have deny-all RLS policies. Access exclusively through Next.js Server Actions using the Supabase service role key — the anon key has zero read/write access.

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project
- A Twilio account

### Setup

```bash
git clone https://github.com/hrbazzi7/mymeds.git
cd mymeds
npm install
```

Copy the environment template and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables (see `.env.example` for all 8):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WEBHOOK_SECRET=
CRON_SECRET=
```

Apply the database migration:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Seed 40 patients covering every clinical outcome combination:

```bash
npm run seed
```

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

To test the patient flow, grab a token from the `assessment_tokens` table in your Supabase dashboard and open:
```
http://localhost:3000/assess/[token]
```

---

## Project Structure

```
app/
  assess/[token]/     — Patient assessment flow (Server Component + Actions)
  api/
    cron/daily/       — Auto-dispatch and reminder cron route
    twilio/status/    — Delivery failure webhook
    twilio/inbound/   — STOP/opt-out webhook
components/
  assess/             — Patient-facing screens (DOB, adherence, symptoms, review)
  dashboard/          — Pharmacist UI components
lib/
  rules.ts            — Clinical rules engine (pure function)
  sms.ts              — SMS dispatch with eligibility guard
  twilio.ts           — Twilio client + webhook validation
  supabase/server.ts  — Service-role Supabase client (server-only)
supabase/
  migrations/         — SQL migration files
scripts/
  seed.ts             — 40-patient seed data
  verify-db.ts        — 25-point schema verification suite
types/
  index.ts            — All enums and row types
  database.ts         — Supabase generic types
```

---

## Security Notes

- **No authentication in this version** — Phase 8 (staff auth) is required before handling real patient data
- All database access is server-side only via service role key
- Deny-all RLS confirmed: anon key returns 0 rows and INSERT is rejected
- No PHI stored client-side, in URLs, or in logs
- Twilio webhook signature validation on all inbound routes
- Deploy behind platform-level password protection until Phase 8 ships

---

## Roadmap

- [ ] Phase 8: Staff authentication (Supabase Auth, role-based access, named attestation)
- [ ] Twilio and Supabase BAA execution for HIPAA compliance
- [ ] Bulk PDF export (date-range download)
- [ ] Dispensing system integration for real-time patient sync
- [ ] Manufacturer adherence reporting module
- [ ] Expanded disease state support beyond Rheumatoid Arthritis

---

## Author

**Hussein Bazzi**
[GitHub](https://github.com/hrbazzi7) · [LinkedIn](http://www.linkedin.com/in/hussein-bazzi-aa630b28a) · hrbazzi7@gmail.com
