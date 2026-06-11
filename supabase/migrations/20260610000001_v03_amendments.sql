-- v0.3 amendments: SMS consent tracking, two new clinical questions,
-- pharmacist attestation columns, and two new audit_action enum values.
--
-- Note on ALTER TYPE ADD VALUE: in PostgreSQL 12+, ADD VALUE can run inside
-- a transaction but the new value is not usable until the transaction commits.
-- The new values (sms_opted_out, assessment_attested) are NOT used in this
-- migration, so running within Supabase's default transaction is safe.

-- patients: consent and opt-out state
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS sms_consent   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opted_out boolean NOT NULL DEFAULT false;

-- assessments: two new clinical questions + pharmacist attestation
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS hospitalized       boolean,
  ADD COLUMN IF NOT EXISTS recent_vaccination  boolean,
  ADD COLUMN IF NOT EXISTS attested_by         text,
  ADD COLUMN IF NOT EXISTS attested_at         timestamptz;

-- audit_action: sms_opted_out (Phase 5) and assessment_attested (Phase 6/7)
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'sms_opted_out';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'assessment_attested';
