MYMEDS MVP SPECIFICATION

Version: 0.3 — Unified (supersedes v0.2)
Pilot target: 50 Rheumatoid Arthritis patients, single specialty pharmacy.

Changes from v0.2 (summary)


Pharmacist attestation of all auto-approved/logged assessments (dashboard batch sign-off) — no assessment completes the audit cycle without a clinician's name on it.
SMS consent and opt-out: consent recorded at import, STOP keyword handling, non-consented/opted-out patients route to the technician call queue instead of receiving SMS.
Two clinical questions added: hospitalization/ER visit since last refill, and recent or upcoming vaccination. Both route to FLAGGED.
Schema, CSV format, audit actions, rules engine, dashboard, PDF, and Definition of Done updated accordingly.


Vision

MyMeds is an SMS-based clinical workflow engine that automates specialty pharmacy monthly assessments, gates refill approval on patient responses, generates audit-ready documentation, and escalates only exception cases to pharmacists — while ensuring every assessment carries documented clinician oversight.

Primary customer: specialty pharmacies. Daily users: certified pharmacy technicians (CPhT) and clinical pharmacists (RPh). End users: RA patients on specialty medications (Enbrel, Humira, Cimzia, Orencia, Simponi).

Problem

Monthly assessments required for URAC/ACHC accreditation and manufacturer programs are performed today as ~20-minute manual phone calls, documented by hand, and reviewed by pharmacists. MyMeds replaces the call with a <90-second patient self-service SMS workflow with exception-only pharmacist intervention and batch attestation of clean cases.

Pilot Success Criteria


≥70% patient completion rate via SMS (floor guarantee: non-completions route to the call queue, so worst case equals today's workflow)
<90 seconds median completion time
100% of completed assessments produce an audit-ready PDF
100% of completed assessments carry a clinician name (attestation or alert review) before the audit cycle closes
100% escalation accuracy: every clinical red flag produces a hold or flag — zero missed
Zero unsafe auto-approvals: no refill auto-approved when any hold or flag condition is present
Zero SMS sent without recorded consent; zero SMS sent after opt-out


Resolved Design Decisions (binding)


Assessment tokens: cryptographically random (crypto module), valid 96 hours, one token reused across all reminder SMS, single-use (invalidated on submission).
DOB verification failure: generic error that never confirms a record exists; max 5 attempts; then token invalidated, status → manual_call_required, audit action dob_failed.
Status enum: pending | in_progress | needs_review | completed | manual_call_required.
CSV format: full_name, dob (YYYY-MM-DD), phone, medication, disease_state, next_refill_date (YYYY-MM-DD), sms_consent (yes/no). Phones normalized to E.164 on import. Consent is captured by the pharmacy at enrollment; MyMeds records and respects it, it does not collect it.
Vaccination routes to FLAGGED, not hold. Patients cannot reliably distinguish live from inactivated vaccines; holding every refill over a flu shot would flood the queue and break exception-only review. The pharmacist determines live-vaccine risk on review.
Screen 2 holds five Yes/No questions as stacked large-button cards (scroll permitted). Five taps keeps the flow under 90 seconds; splitting into more screens adds navigation burden for older users.
PDC is cut from MVP. Requires fill history this system does not collect. Reports state self-reported adherence (missed doses Yes/No), explicitly labeled patient-reported. Never approximate or fabricate PDC.
PDF library: jsPDF, client-side generation from the dashboard.
Pain input: large tap-target 0–10 buttons, not a slider (RA fine-motor limitations).
Logic location: Next.js Server Actions (not Supabase edge functions).
Attestation identity is free text until Phase 8 (no user accounts exist). This is a documented limitation; real identity arrives with auth.


Phase 1 — Foundation

Stack: Next.js 15, TypeScript, Tailwind CSS, Supabase, Twilio, jsPDF. No external UI libraries.

Folder structure: /app, /components, /lib, /types, /supabase, /public.

Environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE, CRON_SECRET, TWILIO_WEBHOOK_SECRET.

Deliverables: working Next.js project, Supabase server client (server-only), Twilio service wrapper, SQL migrations, clean lint and build.

Phase 2 — Database

patients: id (uuid), full_name, dob, phone, medication, disease_state, next_refill_date, sms_consent (bool), sms_opted_out (bool, default false), created_at.

assessments: id (uuid), patient_id, status, missed_doses, medication_changes, hospitalized, recent_vaccination, pain_score, fever, infection, surgery_upcoming, pregnancy_status, refill_confirmed (bool), delivery_approved (bool), risk_outcome, refill_disposition, attested_by, attested_at, opened_at, submitted_at, completed_at, created_at.


risk_outcome enum: auto_approved | logged | flagged | clinical_hold
refill_disposition enum: approved | pending_review | held | declined_by_patient


alerts: id, patient_id, assessment_id, severity (flag | hold), escalation_reason, pharmacist_notes, reviewed_by, reviewed_at, resolved, created_at.

assessment_tokens: id (uuid), assessment_id, token (indexed), expires_at, used, created_at.

audit_logs: id, patient_id, assessment_id, action, timestamp. Actions (17): sms_sent, sms_failed, sms_opted_out, reminder_sent, assessment_opened, dob_verified, dob_failed, assessment_started, assessment_submitted, risk_evaluated, auto_approved, alert_created, clinical_hold_created, alert_resolved, assessment_attested, pdf_generated, manual_call_flagged.

All tables: primary keys, foreign keys, indexes on patient_id columns and assessment_tokens.token, row-level security enabled with deny-all policies. All access via Server Actions using the service role key (server-only). Supabase encryption at rest satisfies the storage-encryption requirement; do not build custom encryption.

Phase 3 — Patient Assessment Workflow

Design: mobile-first (~375px), older-user friendly, 44px+ touch targets, minimal typing (DOB is the only typed field), no PHI in URLs/console/client storage. Target end-to-end completion under 90 seconds.

Route: token-gated (e.g. /assess/[token]). Token validated server-side on every request: must exist, be unused, unexpired. Invalid/expired/used → neutral "link no longer available, please call your pharmacy" page. First valid open: set opened_at, status in_progress, log assessment_opened.

Screen 1 — Identity: DOB input + "Verify & Continue". Success: log dob_verified, assessment_started. Failure handling per Resolved Design Decisions.

Screen 2 — Adherence & Changes: five Yes/No questions as stacked large-button cards: missed any doses; started any new medications; hospitalized or visited the ER since last refill; received or scheduled to receive any vaccinations; upcoming surgery or procedure.

Screen 3 — Symptoms: pain score 0–10 tap targets; multi-select checklist Fever / Active Infection / Pregnancy / None. None is mutually exclusive with the others — enforce in UI.

Screen 4 — Refill Confirmation & Review: display all answers with edit paths, then two confirmation questions: "Are you ready for your refill to be shipped?" Yes/No and "Is your delivery address on file still correct?" Yes/No. Submit button.

On submit (Server Action): save all fields, set submitted_at, mark token used, log assessment_submitted, run rules engine (Phase 4).

Phase 4 — Clinical Rules Engine

Pure function: assessment data in → { risk_outcome, refill_disposition, escalation_reason } out. Evaluate in this precedence order; first match wins for risk_outcome:


CLINICAL HOLD — fever OR infection OR pregnancy_status OR surgery_upcoming. Refill is blocked. refill_disposition = held. Create alert with severity hold. Status needs_review. Log risk_evaluated, clinical_hold_created.
FLAGGED — pain_score ≥ 7 OR missed_doses OR medication_changes OR hospitalized OR recent_vaccination. refill_disposition = pending_review. Create alert with severity flag. Status needs_review. Log risk_evaluated, alert_created.
LOGGED — pain_score 4–6 with no conditions above. Auto-approve: refill_disposition = approved, status completed, clinical note ("moderate pain reported, no red flags") appears on the PDF. Log risk_evaluated, auto_approved.
AUTO-APPROVED — none of the above (pain ≤ 3, all answers clear). refill_disposition = approved, status completed. Log risk_evaluated, auto_approved.


Overrides applied after risk evaluation, regardless of outcome:


refill_confirmed = false → refill_disposition = declined_by_patient, status manual_call_required (technician follow-up, not pharmacist). Log manual_call_flagged.
delivery_approved = false → status manual_call_required for address verification (in addition to any clinical alert). Log manual_call_flagged.
A hold or flag always wins over approval: no refill_disposition may be approved if any hold or flag condition is true.


Pharmacist notification = the alert appearing in the dashboard escalation queue. No staff email/SMS notifications in MVP.

Phase 5 — SMS System

Outbound rules: no medication names, no disease names, no PHI in any SMS body. First name only.

Template:
"Hi [FirstName], your monthly refill review is ready. Complete here: [Secure Link]"

Dispatch eligibility: SMS may only be sent to patients with sms_consent = true AND sms_opted_out = false. This applies to automated dispatch, manual dispatch, and reminders — enforce it in the dispatch function itself, not at call sites.

Automated dispatch: daily cron route (e.g. /api/cron/daily) protected by CRON_SECRET header. Each run: (a) for every eligible patient whose next_refill_date is exactly 7 days away and who has no open assessment for this cycle, create assessment (status pending), generate token, send SMS, log sms_sent; (b) for every INELIGIBLE patient (no consent or opted out) hitting the same trigger, create an assessment with status manual_call_required and log manual_call_flagged — they go to the technician call queue, not silence; (c) process reminders; (d) process timeouts.

Reminders / non-responders: day 2 and day 3 after initial send without submission → re-send same link (eligibility re-checked), log reminder_sent. After day 3 → status manual_call_required, log manual_call_flagged.

Delivery failure: Twilio status callback webhook (e.g. /api/twilio/status) with signature validation. On failed/undelivered: log sms_failed, status manual_call_required immediately.

Opt-out: Twilio inbound message webhook (e.g. /api/twilio/inbound) with signature validation. On STOP/UNSUBSCRIBE/CANCEL/QUIT keywords: set patient sms_opted_out = true, log sms_opted_out, and move any open pending/in_progress assessment for that patient to manual_call_required (log manual_call_flagged). Note: Twilio also enforces STOP at carrier level; this webhook keeps MyMeds' state truthful rather than discovering the block via timeout.

Phase 6 — Dashboard

Staff dashboard, live Supabase queries via Server Actions only. No auth in phases 1–7 (see Security); deployment must sit behind platform-level password protection.


CSV upload per the spec format including sms_consent; per-row validation with row number + reason for rejects; import summary (inserted/rejected); never silent failure.
SMS dispatch: per-patient send + "Send all due" (next_refill_date within 7 days, no open assessment). Both respect dispatch eligibility; the UI shows why an ineligible patient can't be sent to.
Assessment table: Patient Name, Medication, Status, Risk Outcome, Refill Disposition, Escalation Reason, Submission Date. Paginated.
Filters: All, Pending, Completed, Needs Review, Clinical Hold, Flagged, Awaiting Attestation.
Escalation queue: alerts only (exception-only view), holds sorted above flags, showing escalation reason; pharmacist_notes entry, free-text reviewed_by, reviewed_at, resolve action that sets refill_disposition to approved or keeps it held (pharmacist's choice) and logs alert_resolved.
Attestation view: all completed assessments with risk_outcome auto_approved or logged and attested_by null, oldest first. Pharmacist enters their name once, can attest per-row or "Attest all listed" in one action; sets attested_by/attested_at on each, logs assessment_attested per assessment. This is the daily clinician oversight step for clean cases.
Technician call queue: all manual_call_required rows with the reason (non-responder, SMS failed, DOB lockout, refill declined, address change, no SMS consent, opted out).
Seed data: explicit labeled script, 30–50 patients spanning every status, risk outcome, disposition, alert severity, consent state, attestation state, and call-queue reason.


Phase 7 — PDF Report Generator

Per-assessment, generated client-side with jsPDF from the dashboard; log pdf_generated via Server Action.

Contents: header "MyMeds Automated Clinical Assessment Report"; patient (Name, DOB, Medication); assessment data (Missed Doses, Medication Changes, Hospitalization/ER, Vaccination, Surgery Status, Pain Score, Symptoms, Refill Confirmation, Delivery Approval); adherence (self-reported missed doses — explicitly labeled "patient-reported"; no PDC); system data (Risk Outcome, Refill Disposition, Submission Timestamp, Assessment ID); clinical note line for LOGGED outcomes; clinician oversight block — for auto-approved/logged: "Attested by {attested_by} on {attested_at}"; for alert cases: "Reviewed by {reviewed_by} on {reviewed_at}" with pharmacist notes; plus blank Signature and Date lines for wet-ink sign-off.

Must render correctly with long names, all symptoms selected, unattested assessments (oversight block reads "Pending attestation"), and clear/auto-approved assessments.

Security


Tokenized, expiring, single-use links; no patient passwords.
Deny-all RLS; service-role access from Server Actions only.
Audit trail for every patient and system action.
Twilio webhook signature validation on both webhooks.
SMS only with recorded consent; STOP honored in MyMeds state, not just at carrier.
Authentication is Phase 8, not optional. Phases 1–7 ship without staff auth for build/demo purposes only. Before any real patient data: staff authentication (Supabase Auth), real pharmacist identity on attestation and sign-off, and executed Twilio + Supabase BAAs. No real PHI enters this system until Phase 8 is complete.


Explicit Non-Goals (do NOT build)

Epic/CPR+/Therigy integrations, HL7, FHIR, JSON export API, insurance adjudication, copay/prior-auth automation, white labeling, native mobile apps, oncology/multi-disease support, AI clinical decision-making, PDC calculation, consent collection (the pharmacy collects it; MyMeds records it).

MVP Definition of Done

A pharmacy technician can upload a patient CSV with consent flags; the system automatically dispatches SMS assessments 7 days before refill to consented patients only; patients complete a sub-90-second flow; clear cases auto-approve with audit PDFs and receive daily batch pharmacist attestation; red-flag cases (including hospitalization and vaccination) hold or flag the refill and appear in the pharmacist escalation queue; non-responders, SMS failures, DOB lockouts, declined refills, address changes, non-consented patients, and opt-outs land in the technician call queue with reasons; STOP replies immediately opt patients out; and every completed assessment produces an audit-ready PDF bearing a clinician's name — without staff manually calling most patients.