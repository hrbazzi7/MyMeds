Development Rules

Follow MYMEDS_SPEC.md (v0.3) exactly. It is the single source of truth. If the spec is ambiguous, state your assumption in BUILD_LOG.md — do not silently improvise. If you must deviate from the spec to make something work, document the deviation and the reason.

This is an MVP for a 50-patient pilot.

Do NOT build in Phases 1–7


Staff authentication or user accounts (this is Phase 8 — see below)
Epic, CPR+, or Therigy integrations
HL7 / FHIR
JSON export API
Copay assistance or prior authorization workflows
White labeling
PDC calculation (cut from MVP — see spec; never approximate or fabricate it)


Phase 8 rule (read this)

Staff authentication, real pharmacist identity on sign-off, and BAAs with Twilio and Supabase are REQUIRED before any real patient data enters this system. Phases 1–7 run on seed data only. Until Phase 8 ships, every deployment must sit behind platform-level password protection (e.g. Vercel protection) — that is infrastructure config, not an auth system, and does not violate the rule above.

Code rules


All code in TypeScript.
Keep code simple; prefer readable code over abstraction. Do not overengineer.
Use Server Actions for all data access and mutations. The service role key is server-only and must never reach the client.
Do not introduce libraries beyond the spec's stack (Next.js 15, Tailwind, Supabase, Twilio, jsPDF) unless genuinely required — and justify any addition in BUILD_LOG.md. No test frameworks: rules-engine tests use Node's built-in assert.
No external UI libraries. All patient UI mobile-first with 44px+ touch targets.
No placeholder code. Every button performs its real action; every form saves real data; all dashboard tables use live Supabase queries. No mock APIs. No fake data outside the explicit, labeled seed script.
No PHI in SMS bodies, URLs, console logs, or client-side storage.
Generate tokens with the crypto module, never Math.random.


Process rules


Before each work session: read MYMEDS_SPEC.md, this file, and BUILD_LOG.md in full.
Before finishing any work: run npm run lint and npm run build, fix every error, and re-run until both pass. Never report success on a broken build.
After each phase: append to BUILD_LOG.md what was built, decisions made, assumptions, deviations, and known gaps.