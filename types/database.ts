import type {
  Alert,
  AlertSeverity,
  Assessment,
  AssessmentStatus,
  AssessmentToken,
  AuditAction,
  AuditLog,
  Patient,
  RefillDisposition,
  RiskOutcome,
} from "./index";

// Supabase Database type — passed to createClient<Database>() in lib/supabase/server.ts.
// Row types are imported from /types/index.ts (single source of truth).
// Insert types mark auto-generated columns optional; required columns are explicit.
export type Database = {
  public: {
    Tables: {
      patients: {
        Row: Patient;
        Insert: Omit<Patient, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Patient>;
      };
      assessments: {
        Row: Assessment;
        Insert: Pick<Assessment, "patient_id"> &
          Partial<Omit<Assessment, "patient_id">>;
        Update: Partial<Assessment>;
      };
      alerts: {
        Row: Alert;
        Insert: Pick<
          Alert,
          "patient_id" | "assessment_id" | "severity" | "escalation_reason"
        > &
          Partial<Omit<Alert, "patient_id" | "assessment_id" | "severity" | "escalation_reason">>;
        Update: Partial<Alert>;
      };
      assessment_tokens: {
        Row: AssessmentToken;
        Insert: Pick<AssessmentToken, "assessment_id" | "token" | "expires_at"> &
          Partial<Omit<AssessmentToken, "assessment_id" | "token" | "expires_at">>;
        Update: Partial<AssessmentToken>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Pick<AuditLog, "patient_id" | "action"> &
          Partial<Omit<AuditLog, "patient_id" | "action">>;
        Update: Partial<AuditLog>;
      };
    };
    Enums: {
      assessment_status: AssessmentStatus;
      risk_outcome: RiskOutcome;
      refill_disposition: RefillDisposition;
      alert_severity: AlertSeverity;
      audit_action: AuditAction;
    };
  };
};
