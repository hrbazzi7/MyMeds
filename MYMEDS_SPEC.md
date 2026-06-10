MYMEDS MVP SPECIFICATION
Version: 0.2 — Unified (supersedes v0.1; reconciled with PRODUCT VISION v0.1)
Pilot target: 50 Rheumatoid Arthritis patients, single specialty pharmacy.
Vision
MyMeds is an SMS-based clinical workflow engine that automates specialty pharmacy monthly assessments, gates refill approval on patient responses, generates audit-ready documentation, and escalates only exception cases to pharmacists.
Primary customer: specialty pharmacies. Daily users: certified pharmacy technicians (CPhT) and clinical pharmacists (RPh). End users: RA patients on specialty medications (Enbrel, Humira, Cimzia, Orencia, Simponi).
Problem
Monthly assessments required for URAC/ACHC accreditation and manufacturer programs are performed today as ~20-minute manual phone calls, documented by hand, and reviewed by pharmacists. MyMeds replaces the call with a <90-second patient self-service SMS workflow with exception-only pharmacist review.
Pilot Success Criteria

≥70% patient completion rate via SMS
<90 seconds median completion time
100% of completed assessments produce an audit-ready PDF
100% escalation accuracy: every clinical red flag (fever, infection, pregnancy, surgery) produces a hold — zero missed
Zero unsafe auto-approvals: no refill auto-approved when any hold or flag condition is present

Resolved Design Decisions (binding)
These were previously undocumented; they are now part of the spec:

Assessment tokens: cryptographically random (crypto module), valid 96 hours, one token reused across all reminder SMS, single-use (invalidated on submission).
DOB verification failure: generic error that never confirms a record exists; max 5 attempts; then token invalidated, status → manual_call_required, audit action dob_failed.
Status enum: pending | in_progress | needs_review | completed | manual_call_required.
CSV format: full_name, dob (YYYY-MM-DD), phone, medication, disease_state, next_refill_date (YYYY-MM-DD). Phones normalized to E.164 on import.
PDC is cut from MVP. Proportion-of-days-covered requires fill history (fill dates + days supply), which this system does not collect. Reports state self-reported adherence (missed doses Yes/No) instead. PDC returns when fill-history import exists (future phase). Do not approximate or fabricate PDC.
PDF library: jsPDF, client-side generation from the dashboard. (Vision's React-PDF/server generation deferred.)
Pain input: large tap-target 0–10 buttons, not a slider. RA patients have limited fine motor control; sliders are hostile to this population.
Logic location: Next.js Server Actions (not Supabase edge functions).

Phase 1 — Foundation
Stack: Next.js 15, TypeScript, Tailwind CSS, Supabase, Twilio, jsPDF. No external UI libraries.
Folder structure: /app, /components, /lib, /types, /supabase, /public.
Environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE, CRON_SECRET, TWILIO_WEBHOOK_SECRET.
Deliverables: working Next.js project, Supabase server client, Twilio service wrapper, SQL migrations, clean lint and build.
Phase 2 — Database
patients: id (uuid), full_name, dob, phone, medication, disease_state, next_refill_date, created_at.
assessments: id (uuid), patient_id, status, missed_doses, medication_changes, pain_score, fever, infection, surgery_upcoming, pregnancy_status, refill_confirmed (bool), delivery_approved (bool), risk_outcome, refill_disposition, opened_at, submitted_at, completed_at, created_at.

risk_outcome enum: auto_approved | logged | flagged | clinical_hold
refill_disposition enum: approved | pending_review | held | declined_by_patient

alerts: id, patient_id, assessment_id, severity (flag | hold), escalation_reason, pharmacist_notes, reviewed_by, reviewed_at, resolved, created_at.
assessment_tokens: id (uuid), assessment_id, token (indexed), expires_at, used, created_at.
audit_logs: id, patient_id, assessment_id, action, timestamp. Actions: sms_sent, sms_failed, reminder_sent, assessment_opened, dob_verified, dob_failed, assessment_started, assessment_submitted, risk_evaluated, auto_approved, alert_created, clinical_hold_created, alert_resolved, pdf_generated, manual_call_flagged.
All tables: primary keys, foreign keys, indexes on patient_id columns and assessment_tokens.token, row-level security enabled with deny-all policies. All access via Server Actions using the service role key (server-only). Supabase encryption at rest satisfies the storage-encryption requirement; do not build custom encryption.
Phase 3 — Patient Assessment Workflow
Design: mobile-first (~375px), older-user friendly, 44px+ touch targets, minimal typing (DOB is the only typed field), one question group per screen, no PHI in URLs/console/client storage. Target end-to-end completion under 90 seconds.
Route: token-gated (e.g. /assess/[token]). Token validated server-side on every request: must exist, be unused, unexpired. Invalid/expired/used → neutral "link no longer available, please call your pharmacy" page. First valid open: set opened_at, status in_progress, log assessment_opened.
Screen 1 — Identity: DOB input + "Verify & Continue". Success: log dob_verified, assessment_started. Failure handling per Resolved Design Decisions.
Screen 2 — Adherence & Changes: three Yes/No questions as large buttons: missed any doses; started any new medications; upcoming surgery or procedure.
Screen 3 — Symptoms: pain score 0–10 tap targets; multi-select checklist Fever / Active Infection / Pregnancy / None. None is mutually exclusive with the others — enforce in UI.
Screen 4 — Refill Confirmation & Review: display all answers with edit paths, then two confirmation questions: "Are you ready for your refill to be shipped?" Yes/No and "Is your delivery address on file still correct?" Yes/No. Submit button.
On submit (Server Action): save all fields, set submitted_at, mark token used, log assessment_submitted, run rules engine (Phase 4).
Phase 4 — Clinical Rules Engine
Pure function: assessment data in → { risk_outcome, refill_disposition, escalation_reason } out. Evaluate in this precedence order; first match wins for risk_outcome:

CLINICAL HOLD — fever OR infection OR pregnancy_status OR surgery_upcoming. Refill is blocked. refill_disposition = held. Create alert with severity hold. Status needs_review. Log risk_evaluated, clinical_hold_created.
FLAGGED — pain_score ≥ 7 OR missed_doses OR medication_changes. refill_disposition = pending_review. Create alert with severity flag. Status needs_review. Log risk_evaluated, alert_created.
LOGGED — pain_score 4–6 with no conditions above. Auto-approve: refill_disposition = approved, status completed, clinical note ("moderate pain reported, no red flags") appears on the PDF. Log risk_evaluated, auto_approved.
AUTO-APPROVED — none of the above (pain ≤ 3, all answers clear). refill_disposition = approved, status completed. Log risk_evaluated, auto_approved.

Overrides applied after risk evaluation, regardless of outcome:

refill_confirmed = false → refill_disposition = declined_by_patient, status manual_call_required (technician follow-up, not pharmacist). Log manual_call_flagged.
delivery_approved = false → status manual_call_required for address verification (in addition to any clinical alert). Log manual_call_flagged.
A hold or flag always wins over approval: no refill_disposition may be approved if any hold or flag condition is true.

Pharmacist notification = the alert appearing in the dashboard escalation queue. No staff email/SMS notifications in MVP (no user accounts exist).
Phase 5 — SMS System
Outbound rules: no medication names, no disease names, no PHI in any SMS body. First name only.
Template:
"Hi [FirstName], your monthly refill review is ready. Complete here: [Secure Link]"
Automated dispatch: daily cron route (e.g. /api/cron/daily) protected by CRON_SECRET header. Each run: (a) for every patient whose next_refill_date is exactly 7 days away and who has no open assessment for this cycle, create assessment (status pending), generate token, send SMS, log sms_sent; (b) process reminders; (c) process timeouts. Manual per-patient dispatch from the dashboard uses the same function.
Reminders / non-responders: day 2 and day 3 after initial send without submission → re-send same link, log reminder_sent. After day 3 → status manual_call_required, log manual_call_flagged; patient appears in technician call queue.
Delivery failure: Twilio status callback webhook route (e.g. /api/twilio/status) with request validation. On failed/undelivered: log sms_failed, status manual_call_required immediately — a patient who never received the link must not wait three days.
Phase 6 — Dashboard
Staff dashboard, live Supabase queries via Server Actions only. No auth in phases 1–7 (see Security); deployment must sit behind platform-level password protection.

CSV upload per the spec format; per-row validation with row number + reason for rejects; import summary (inserted/rejected); never silent failure.
SMS dispatch: per-patient send + "Send all due" (next_refill_date within 7 days, no open assessment).
Assessment table: Patient Name, Medication, Status, Risk Outcome, Refill Disposition, Escalation Reason, Submission Date. Paginated.
Filters: All, Pending, Completed, Needs Review, Clinical Hold, Flagged.
Escalation queue: alerts only (exception-only view), holds sorted above flags, showing escalation reason; pharmacist_notes entry, free-text reviewed_by, reviewed_at, resolve action that sets refill_disposition to approved or keeps it held (pharmacist's choice) and logs alert_resolved.
Technician call queue: all manual_call_required rows with the reason (non-responder, SMS failed, DOB lockout, refill declined, address change).
Seed data: explicit labeled script, 30–50 patients spanning every status, risk outcome, disposition, alert severity, and call-queue reason.

Phase 7 — PDF Report Generator
Per-assessment, generated client-side with jsPDF from the dashboard; log pdf_generated via Server Action.
Contents: header "MyMeds Automated Clinical Assessment Report"; patient (Name, DOB, Medication); assessment data (Missed Doses, Medication Changes, Surgery Status, Pain Score, Symptoms, Refill Confirmation, Delivery Approval); adherence (self-reported missed doses — explicitly labeled "patient-reported"; no PDC, see Resolved Design Decisions); system data (Risk Outcome, Refill Disposition, Submission Timestamp, Assessment ID); clinical note line for LOGGED outcomes; Pharmacist Sign-Off section with blank Signature and Date lines, plus reviewed_by/reviewed_at if an alert was resolved.
Must render correctly with long names, all symptoms selected, and clear/auto-approved assessments.
Security

Tokenized, expiring, single-use links; no patient passwords.
Deny-all RLS; service-role access from Server Actions only.
Audit trail for every patient and system action.
Twilio webhook signature validation.
Authentication is Phase 8, not optional. Phases 1–7 ship without staff auth for build/demo purposes only. Before any real patient data: staff authentication (Supabase Auth), real pharmacist identity on sign-off, and an executed Twilio + Supabase BAA. No real PHI enters this system until Phase 8 is complete.

Explicit Non-Goals (do NOT build)
Epic/CPR+/Therigy integrations, HL7, FHIR, JSON export API, insurance adjudication, copay/prior-auth automation, white labeling, native mobile apps, oncology/multi-disease support, AI clinical decision-making, PDC calculation.
MVP Definition of Done
A pharmacy technician can upload a patient CSV; the system automatically dispatches SMS assessments 7 days before refill; patients complete a sub-90-second flow; clear cases auto-approve with audit PDFs and zero staff touch; red-flag cases hold the refill and appear in the pharmacist escalation queue; non-responders, SMS failures, DOB lockouts, declined refills, and address changes land in the technician call queue; and every completed assessment produces an audit-ready PDF — without staff manually calling most patients.