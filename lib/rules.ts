import type {
  AlertSeverity,
  AssessmentStatus,
  RefillDisposition,
  RiskOutcome,
} from "../types/index";

export type RulesInput = {
  missed_doses: boolean;
  medication_changes: boolean;
  hospitalized: boolean;
  recent_vaccination: boolean;
  surgery_upcoming: boolean;
  pain_score: number;
  fever: boolean;
  infection: boolean;
  pregnancy_status: boolean;
  refill_confirmed: boolean;
  delivery_approved: boolean;
};

export type RulesResult = {
  risk_outcome: RiskOutcome;
  refill_disposition: RefillDisposition;
  status: AssessmentStatus;
  escalation_reason: string;
  alert_severity: AlertSeverity | null;
};

export function evaluateRules(input: RulesInput): RulesResult {
  let risk_outcome: RiskOutcome;
  let refill_disposition: RefillDisposition;
  let status: AssessmentStatus;
  let escalation_reason: string;
  let alert_severity: AlertSeverity | null;

  // Precedence: CLINICAL HOLD > FLAGGED > LOGGED > AUTO-APPROVED (first match wins)
  if (
    input.fever ||
    input.infection ||
    input.pregnancy_status ||
    input.surgery_upcoming
  ) {
    const triggers: string[] = [];
    if (input.fever) triggers.push("fever");
    if (input.infection) triggers.push("active infection");
    if (input.pregnancy_status) triggers.push("pregnancy");
    if (input.surgery_upcoming) triggers.push("upcoming surgery");

    risk_outcome = "clinical_hold";
    refill_disposition = "held";
    status = "needs_review";
    escalation_reason = triggers.join(", ");
    alert_severity = "hold";
  } else if (
    input.pain_score >= 7 ||
    input.missed_doses ||
    input.medication_changes ||
    input.hospitalized ||
    input.recent_vaccination
  ) {
    const triggers: string[] = [];
    if (input.pain_score >= 7) triggers.push(`pain score ${input.pain_score}`);
    if (input.missed_doses) triggers.push("missed doses");
    if (input.medication_changes) triggers.push("medication changes");
    if (input.hospitalized) triggers.push("hospitalized/ER");
    if (input.recent_vaccination) triggers.push("recent vaccination");

    risk_outcome = "flagged";
    refill_disposition = "pending_review";
    status = "needs_review";
    escalation_reason = triggers.join(", ");
    alert_severity = "flag";
  } else if (input.pain_score >= 4 && input.pain_score <= 6) {
    risk_outcome = "logged";
    refill_disposition = "approved";
    status = "completed";
    escalation_reason = `pain score ${input.pain_score}`;
    alert_severity = null;
  } else {
    risk_outcome = "auto_approved";
    refill_disposition = "approved";
    status = "completed";
    escalation_reason = "";
    alert_severity = null;
  }

  // Post-evaluation overrides (applied regardless of the base outcome)
  if (!input.refill_confirmed) {
    refill_disposition = "declined_by_patient";
    status = "manual_call_required";
  }
  if (!input.delivery_approved) {
    status = "manual_call_required";
  }

  return { risk_outcome, refill_disposition, status, escalation_reason, alert_severity };
}
