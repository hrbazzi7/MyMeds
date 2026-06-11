// ─── Enum union types — single source of truth for all enum values ─────────

export type AssessmentStatus =
  | "pending"
  | "in_progress"
  | "needs_review"
  | "completed"
  | "manual_call_required";

export type RiskOutcome =
  | "auto_approved"
  | "logged"
  | "flagged"
  | "clinical_hold";

export type RefillDisposition =
  | "approved"
  | "pending_review"
  | "held"
  | "declined_by_patient";

export type AlertSeverity = "flag" | "hold";

export type AuditAction =
  | "sms_sent"
  | "sms_failed"
  | "sms_opted_out"
  | "reminder_sent"
  | "assessment_opened"
  | "dob_verified"
  | "dob_failed"
  | "assessment_started"
  | "assessment_submitted"
  | "risk_evaluated"
  | "auto_approved"
  | "alert_created"
  | "clinical_hold_created"
  | "alert_resolved"
  | "assessment_attested"
  | "pdf_generated"
  | "manual_call_flagged";

// ─── Table row types ─────────────────────────────────────────────────────────

export type Patient = {
  id: string;
  full_name: string;
  dob: string; // YYYY-MM-DD
  phone: string; // E.164
  medication: string;
  disease_state: string;
  next_refill_date: string; // YYYY-MM-DD
  sms_consent: boolean;
  sms_opted_out: boolean;
  created_at: string;
};

export type Assessment = {
  id: string;
  patient_id: string;
  status: AssessmentStatus;
  missed_doses: boolean | null;
  medication_changes: boolean | null;
  hospitalized: boolean | null;
  recent_vaccination: boolean | null;
  pain_score: number | null; // 0–10
  fever: boolean | null;
  infection: boolean | null;
  surgery_upcoming: boolean | null;
  pregnancy_status: boolean | null;
  refill_confirmed: boolean | null;
  delivery_approved: boolean | null;
  risk_outcome: RiskOutcome | null;
  refill_disposition: RefillDisposition | null;
  attested_by: string | null;
  attested_at: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type Alert = {
  id: string;
  patient_id: string;
  assessment_id: string;
  severity: AlertSeverity;
  escalation_reason: string;
  pharmacist_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolved: boolean;
  created_at: string;
};

export type AssessmentToken = {
  id: string;
  assessment_id: string;
  token: string; // cryptographically random, indexed
  expires_at: string;
  used: boolean;
  created_at: string;
};

export type AuditLog = {
  id: string;
  patient_id: string;
  assessment_id: string | null; // nullable — some actions precede any assessment
  action: AuditAction;
  timestamp: string;
};

// ─── PDF generation data shape ────────────────────────────────────────────────

export type PdfData = {
  full_name: string;
  dob: string;
  medication: string;
  assessment_id: string;
  patient_id: string;
  missed_doses: boolean | null;
  medication_changes: boolean | null;
  hospitalized: boolean | null;
  recent_vaccination: boolean | null;
  surgery_upcoming: boolean | null;
  pain_score: number | null;
  fever: boolean | null;
  infection: boolean | null;
  pregnancy_status: boolean | null;
  refill_confirmed: boolean | null;
  delivery_approved: boolean | null;
  risk_outcome: RiskOutcome | null;
  refill_disposition: RefillDisposition | null;
  submitted_at: string | null;
  attested_by: string | null;
  attested_at: string | null;
  escalation_reason: string | null;
  pharmacist_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
