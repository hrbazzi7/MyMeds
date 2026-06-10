-- MyMeds initial schema migration
-- Phase 2: patients, assessments, alerts, assessment_tokens, audit_logs
-- All tables: deny-all RLS; service role bypasses RLS for all Server Action access.

-- ─── Enum types ────────────────────────────────────────────────────────────

CREATE TYPE assessment_status AS ENUM (
  'pending',
  'in_progress',
  'needs_review',
  'completed',
  'manual_call_required'
);

CREATE TYPE risk_outcome AS ENUM (
  'auto_approved',
  'logged',
  'flagged',
  'clinical_hold'
);

CREATE TYPE refill_disposition AS ENUM (
  'approved',
  'pending_review',
  'held',
  'declined_by_patient'
);

CREATE TYPE alert_severity AS ENUM (
  'flag',
  'hold'
);

CREATE TYPE audit_action AS ENUM (
  'sms_sent',
  'sms_failed',
  'reminder_sent',
  'assessment_opened',
  'dob_verified',
  'dob_failed',
  'assessment_started',
  'assessment_submitted',
  'risk_evaluated',
  'auto_approved',
  'alert_created',
  'clinical_hold_created',
  'alert_resolved',
  'pdf_generated',
  'manual_call_flagged'
);

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE patients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        TEXT        NOT NULL,
  dob              DATE        NOT NULL,
  phone            TEXT        NOT NULL,  -- E.164 format, normalized on import
  medication       TEXT        NOT NULL,
  disease_state    TEXT        NOT NULL,
  next_refill_date DATE        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assessments (
  id                  UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID                NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  status              assessment_status   NOT NULL DEFAULT 'pending',
  missed_doses        BOOLEAN,
  medication_changes  BOOLEAN,
  pain_score          INTEGER             CHECK (pain_score >= 0 AND pain_score <= 10),
  fever               BOOLEAN,
  infection           BOOLEAN,
  surgery_upcoming    BOOLEAN,
  pregnancy_status    BOOLEAN,
  refill_confirmed    BOOLEAN,
  delivery_approved   BOOLEAN,
  risk_outcome        risk_outcome,
  refill_disposition  refill_disposition,
  opened_at           TIMESTAMPTZ,
  submitted_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE alerts (
  id                 UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id         UUID           NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assessment_id      UUID           NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  severity           alert_severity NOT NULL,
  escalation_reason  TEXT           NOT NULL,
  pharmacist_notes   TEXT,
  reviewed_by        TEXT,
  reviewed_at        TIMESTAMPTZ,
  resolved           BOOLEAN        NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE assessment_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  UUID        NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  token          TEXT        NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used           BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id     UUID         NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  assessment_id  UUID         REFERENCES assessments(id) ON DELETE SET NULL,
  action         audit_action NOT NULL,
  timestamp      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_assessments_patient_id       ON assessments(patient_id);
CREATE INDEX idx_alerts_patient_id            ON alerts(patient_id);
CREATE INDEX idx_alerts_assessment_id         ON alerts(assessment_id);
CREATE INDEX idx_assessment_tokens_token      ON assessment_tokens(token);
CREATE INDEX idx_assessment_tokens_assessment ON assessment_tokens(assessment_id);
CREATE INDEX idx_audit_logs_patient_id        ON audit_logs(patient_id);
CREATE INDEX idx_audit_logs_assessment_id     ON audit_logs(assessment_id);

-- ─── Row-Level Security — deny all ──────────────────────────────────────────
-- Service role bypasses RLS; anon and authenticated roles are denied entirely.
-- All data access flows through Server Actions with the service role key.

ALTER TABLE patients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all" ON patients
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_all" ON assessments
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_all" ON alerts
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_all" ON assessment_tokens
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE POLICY "deny_all" ON audit_logs
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
