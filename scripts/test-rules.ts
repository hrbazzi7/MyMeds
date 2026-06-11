import assert from "node:assert/strict";
import { evaluateRules } from "../lib/rules";
import type { RulesInput } from "../lib/rules";

// All-clear baseline — every test spreads this and overrides specific fields
const BASE: RulesInput = {
  missed_doses: false,
  medication_changes: false,
  hospitalized: false,
  recent_vaccination: false,
  surgery_upcoming: false,
  pain_score: 0,
  fever: false,
  infection: false,
  pregnancy_status: false,
  refill_confirmed: true,
  delivery_approved: true,
};

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${label}: ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log("\n── Hold triggers (1–4) ─────────────────────────────────────────────");

test("fever → clinical_hold + held + needs_review + hold alert", () => {
  const r = evaluateRules({ ...BASE, fever: true });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "hold");
});

test("infection → clinical_hold + held + needs_review + hold alert", () => {
  const r = evaluateRules({ ...BASE, infection: true });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "hold");
});

test("pregnancy_status → clinical_hold + held + needs_review + hold alert", () => {
  const r = evaluateRules({ ...BASE, pregnancy_status: true });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "hold");
});

test("surgery_upcoming → clinical_hold + held + needs_review + hold alert", () => {
  const r = evaluateRules({ ...BASE, surgery_upcoming: true });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "hold");
});

console.log("\n── Flag triggers (5–9) ─────────────────────────────────────────────");

test("pain_score=7 → flagged + pending_review + needs_review + flag alert", () => {
  const r = evaluateRules({ ...BASE, pain_score: 7 });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.refill_disposition, "pending_review");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "flag");
});

test("missed_doses → flagged + pending_review + needs_review + flag alert", () => {
  const r = evaluateRules({ ...BASE, missed_doses: true });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.refill_disposition, "pending_review");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "flag");
});

test("medication_changes → flagged + pending_review + needs_review + flag alert", () => {
  const r = evaluateRules({ ...BASE, medication_changes: true });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.refill_disposition, "pending_review");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "flag");
});

test("hospitalized → flagged + pending_review + needs_review + flag alert", () => {
  const r = evaluateRules({ ...BASE, hospitalized: true });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.refill_disposition, "pending_review");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "flag");
});

test("recent_vaccination → flagged (not clinical_hold)", () => {
  const r = evaluateRules({ ...BASE, recent_vaccination: true });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.refill_disposition, "pending_review");
  assert.equal(r.status, "needs_review");
  assert.equal(r.alert_severity, "flag");
});

console.log("\n── Pain boundaries (10–13) ──────────────────────────────────────────");

test("pain=3 → auto_approved + approved + completed + no alert", () => {
  const r = evaluateRules({ ...BASE, pain_score: 3 });
  assert.equal(r.risk_outcome, "auto_approved");
  assert.equal(r.refill_disposition, "approved");
  assert.equal(r.status, "completed");
  assert.equal(r.alert_severity, null);
});

test("pain=4 → logged + approved + completed + no alert", () => {
  const r = evaluateRules({ ...BASE, pain_score: 4 });
  assert.equal(r.risk_outcome, "logged");
  assert.equal(r.refill_disposition, "approved");
  assert.equal(r.status, "completed");
  assert.equal(r.alert_severity, null);
});

test("pain=6 → logged + approved + completed + no alert", () => {
  const r = evaluateRules({ ...BASE, pain_score: 6 });
  assert.equal(r.risk_outcome, "logged");
  assert.equal(r.refill_disposition, "approved");
  assert.equal(r.status, "completed");
  assert.equal(r.alert_severity, null);
});

test("pain=7 → flagged (not logged)", () => {
  const r = evaluateRules({ ...BASE, pain_score: 7 });
  assert.equal(r.risk_outcome, "flagged");
  assert.equal(r.alert_severity, "flag");
});

console.log("\n── Precedence & overrides (14–17) ───────────────────────────────────");

test("hold beats flag: fever=true + pain_score=8 → clinical_hold (not flagged)", () => {
  const r = evaluateRules({ ...BASE, fever: true, pain_score: 8 });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.alert_severity, "hold");
});

test("override: refill_confirmed=false on clean → declined_by_patient + manual_call_required", () => {
  const r = evaluateRules({ ...BASE, refill_confirmed: false });
  assert.equal(r.risk_outcome, "auto_approved");
  assert.equal(r.refill_disposition, "declined_by_patient");
  assert.equal(r.status, "manual_call_required");
});

test("override: surgery_upcoming=true + delivery_approved=false → hold alert + manual_call_required", () => {
  const r = evaluateRules({ ...BASE, surgery_upcoming: true, delivery_approved: false });
  assert.equal(r.risk_outcome, "clinical_hold");
  assert.equal(r.refill_disposition, "held");
  assert.equal(r.status, "manual_call_required");
  assert.equal(r.alert_severity, "hold");
});

test("all-clear: everything false, pain=0 → auto_approved + approved + completed + no alert", () => {
  const r = evaluateRules({ ...BASE });
  assert.equal(r.risk_outcome, "auto_approved");
  assert.equal(r.refill_disposition, "approved");
  assert.equal(r.status, "completed");
  assert.equal(r.alert_severity, null);
  assert.equal(r.escalation_reason, "");
});

const total = passed + failed;
console.log(`\n── Result: ${passed}/${total} passed, ${failed} failed ────────────────────────`);
if (failed > 0) process.exit(1);
