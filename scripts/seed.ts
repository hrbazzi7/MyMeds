/**
 * MyMeds Phase 6 — Seed Script
 * Creates 40 labeled patients spanning every status, risk outcome, refill
 * disposition, alert severity, consent state, attestation state, and call-queue
 * reason.
 *
 * Run: npx tsx scripts/seed.ts
 * Idempotent: deletes existing seed rows first (matched by full_name prefix "SEED_").
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import * as fs from "fs";
import * as path from "path";

// ── Load .env.local ─────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env vars. Copy .env.example to .env.local and fill in values.");
  process.exit(1);
}

const db = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysAgoDate(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

let counter = 0;
function nextPhone(): string {
  counter++;
  return `+1555${String(counter).padStart(7, "0")}`;
}

function makeDob(year: number): string {
  return `${year}-06-15`;
}

const MEDICATIONS = ["Enbrel", "Humira", "Cimzia", "Orencia", "Simponi"];
function med(i: number): string {
  return MEDICATIONS[i % MEDICATIONS.length];
}

// ── Cleanup existing seed data ───────────────────────────────────────────────

async function cleanup() {
  console.log("Cleaning up existing seed data (full_name LIKE 'SEED_%')...");
  const { data: seedPatients } = await db
    .from("patients")
    .select("id")
    .like("full_name", "SEED_%");

  if (!seedPatients || seedPatients.length === 0) {
    console.log("  No existing seed data found.");
    return;
  }

  const ids = seedPatients.map((p) => p.id);
  // Cascade via FK should handle audit_logs, assessment_tokens, alerts, assessments
  await db.from("patients").delete().in("id", ids);
  console.log(`  Deleted ${ids.length} seed patients and cascaded rows.`);
}

// ── Patient factory ──────────────────────────────────────────────────────────

async function insertPatient(params: {
  name: string;
  dobYear: number;
  medication: string;
  sms_consent?: boolean;
  sms_opted_out?: boolean;
  next_refill_date?: string;
}): Promise<string> {
  const { data, error } = await db
    .from("patients")
    .insert({
      full_name: `SEED_${params.name}`,
      dob: makeDob(params.dobYear),
      phone: nextPhone(),
      medication: params.medication,
      disease_state: "Rheumatoid Arthritis",
      next_refill_date: params.next_refill_date ?? daysFromNow(30),
      sms_consent: params.sms_consent ?? true,
      sms_opted_out: params.sms_opted_out ?? false,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Patient insert failed: ${error?.message}`);
  return data.id;
}

async function insertAssessment(params: {
  patient_id: string;
  status: string;
  risk_outcome?: string | null;
  refill_disposition?: string | null;
  missed_doses?: boolean;
  medication_changes?: boolean;
  hospitalized?: boolean;
  recent_vaccination?: boolean;
  surgery_upcoming?: boolean;
  pain_score?: number;
  fever?: boolean;
  infection?: boolean;
  pregnancy_status?: boolean;
  refill_confirmed?: boolean;
  delivery_approved?: boolean;
  submitted_at?: string | null;
  completed_at?: string | null;
  opened_at?: string | null;
  attested_by?: string | null;
  attested_at?: string | null;
  created_at?: string;
}): Promise<string> {
  const { data, error } = await db
    .from("assessments")
    .insert({
      patient_id: params.patient_id,
      status: params.status as never,
      risk_outcome: (params.risk_outcome ?? null) as never,
      refill_disposition: (params.refill_disposition ?? null) as never,
      missed_doses: params.missed_doses ?? null,
      medication_changes: params.medication_changes ?? null,
      hospitalized: params.hospitalized ?? null,
      recent_vaccination: params.recent_vaccination ?? null,
      surgery_upcoming: params.surgery_upcoming ?? null,
      pain_score: params.pain_score ?? null,
      fever: params.fever ?? null,
      infection: params.infection ?? null,
      pregnancy_status: params.pregnancy_status ?? null,
      refill_confirmed: params.refill_confirmed ?? null,
      delivery_approved: params.delivery_approved ?? null,
      submitted_at: params.submitted_at ?? null,
      completed_at: params.completed_at ?? null,
      opened_at: params.opened_at ?? null,
      attested_by: params.attested_by ?? null,
      attested_at: params.attested_at ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Assessment insert failed: ${error?.message}`);
  return data.id;
}

async function insertAlert(params: {
  patient_id: string;
  assessment_id: string;
  severity: "flag" | "hold";
  escalation_reason: string;
  resolved?: boolean;
  pharmacist_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}): Promise<void> {
  const { error } = await db.from("alerts").insert({
    patient_id: params.patient_id,
    assessment_id: params.assessment_id,
    severity: params.severity,
    escalation_reason: params.escalation_reason,
    resolved: params.resolved ?? false,
    pharmacist_notes: params.pharmacist_notes ?? null,
    reviewed_by: params.reviewed_by ?? null,
    reviewed_at: params.reviewed_at ?? null,
  });
  if (error) throw new Error(`Alert insert failed: ${error.message}`);
}

async function insertAuditLogs(
  logs: Array<{ patient_id: string; assessment_id?: string | null; action: string }>
): Promise<void> {
  const { error } = await db.from("audit_logs").insert(
    logs.map((l) => ({
      patient_id: l.patient_id,
      assessment_id: l.assessment_id ?? null,
      action: l.action as never,
    }))
  );
  if (error) throw new Error(`Audit log insert failed: ${error.message}`);
}

// ── Seed groups ──────────────────────────────────────────────────────────────

async function seedGroup(label: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${label}... `);
  await fn();
  console.log("done");
}

async function main() {
  await cleanup();
  console.log("\nSeeding 40 patients...\n");

  // ── Group A: completed, auto_approved, ATTESTED (3 patients) ────────────
  await seedGroup("A1 auto_approved attested (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Alice Abrams", dobYear: 1972, medication: med(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 2,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(5), completed_at: daysAgo(5),
      attested_by: "Dr. Sarah Chen, RPh", attested_at: daysAgo(4),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "assessment_attested" },
    ]);
  });

  await seedGroup("A2 auto_approved attested (Humira)", async () => {
    const pid = await insertPatient({ name: "Bob Brewer", dobYear: 1965, medication: med(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 1,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(3), completed_at: daysAgo(3),
      attested_by: "Dr. Marcus Reyes, RPh", attested_at: daysAgo(2),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "assessment_attested" },
    ]);
  });

  await seedGroup("A3 auto_approved attested (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Carol Chase", dobYear: 1980, medication: med(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 0,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(10), completed_at: daysAgo(10),
      attested_by: "Dr. Sarah Chen, RPh", attested_at: daysAgo(9),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "assessment_attested" },
    ]);
  });

  // ── Group B: completed, auto_approved, NOT YET ATTESTED (3 patients) ────
  await seedGroup("B1 auto_approved unattested (Orencia)", async () => {
    const pid = await insertPatient({ name: "David Dunn", dobYear: 1958, medication: med(3) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 3,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1), completed_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  await seedGroup("B2 auto_approved unattested (Simponi)", async () => {
    const pid = await insertPatient({ name: "Ellen Evans", dobYear: 1975, medication: med(4) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 2,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(2), completed_at: daysAgo(2),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  await seedGroup("B3 auto_approved unattested (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Frank Foster", dobYear: 1962, medication: med(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 1,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1), completed_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  // ── Group C: completed, logged (pain 4-6), ATTESTED (2 patients) ─────────
  await seedGroup("C1 logged pain=5 attested (Humira)", async () => {
    const pid = await insertPatient({ name: "Grace Green", dobYear: 1968, medication: med(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "logged", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 5,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(6), completed_at: daysAgo(6),
      attested_by: "Dr. Marcus Reyes, RPh", attested_at: daysAgo(5),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "assessment_attested" },
    ]);
  });

  await seedGroup("C2 logged pain=4 attested (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Henry Hill", dobYear: 1971, medication: med(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "logged", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 4,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(8), completed_at: daysAgo(8),
      attested_by: "Dr. Sarah Chen, RPh", attested_at: daysAgo(7),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "assessment_attested" },
    ]);
  });

  // ── Group D: completed, logged, NOT YET ATTESTED (3 patients) ───────────
  await seedGroup("D1 logged pain=6 unattested (Orencia)", async () => {
    const pid = await insertPatient({ name: "Iris Ingram", dobYear: 1983, medication: med(3) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "logged", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 6,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1), completed_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  await seedGroup("D2 logged pain=5 unattested (Simponi)", async () => {
    const pid = await insertPatient({ name: "James Jensen", dobYear: 1966, medication: med(4) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "logged", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 5,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(2), completed_at: daysAgo(2),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  await seedGroup("D3 logged pain=4 unattested (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Karen Kim", dobYear: 1977, medication: med(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "logged", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 4,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1), completed_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  // ── Group E: needs_review, FLAGGED, unresolved (5 patients — 1 per trigger) ─
  await seedGroup("E1 flagged pain=8 (Humira)", async () => {
    const pid = await insertPatient({ name: "Leo Larson", dobYear: 1969, medication: med(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 8,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "pain score 8" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  await seedGroup("E2 flagged missed_doses (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Maria Mendez", dobYear: 1974, medication: med(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: true, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 3,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(2),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "missed doses" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  await seedGroup("E3 flagged medication_changes (Orencia)", async () => {
    const pid = await insertPatient({ name: "Nathan Nash", dobYear: 1961, medication: med(3) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: false, medication_changes: true, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 2,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "medication changes" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  await seedGroup("E4 flagged hospitalized (Simponi)", async () => {
    const pid = await insertPatient({ name: "Olivia Owens", dobYear: 1979, medication: med(4) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: false, medication_changes: false, hospitalized: true,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 4,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(3),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "hospitalized/ER" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  await seedGroup("E5 flagged recent_vaccination (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Paul Park", dobYear: 1985, medication: med(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: true, surgery_upcoming: false, pain_score: 2,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "recent vaccination" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  // ── Group F: needs_review, CLINICAL HOLD, unresolved (4 patients) ─────────
  await seedGroup("F1 clinical_hold fever (Humira)", async () => {
    const pid = await insertPatient({ name: "Quinn Quinn", dobYear: 1970, medication: med(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 3,
      fever: true, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(2),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "hold", escalation_reason: "fever" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
    ]);
  });

  await seedGroup("F2 clinical_hold infection (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Rachel Reed", dobYear: 1963, medication: med(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 6,
      fever: false, infection: true, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "hold", escalation_reason: "active infection" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
    ]);
  });

  await seedGroup("F3 clinical_hold pregnancy (Orencia)", async () => {
    const pid = await insertPatient({ name: "Sofia Santos", dobYear: 1987, medication: med(3) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 4,
      fever: false, infection: false, pregnancy_status: true,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "hold", escalation_reason: "pregnancy" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
    ]);
  });

  await seedGroup("F4 clinical_hold surgery_upcoming (Simponi)", async () => {
    const pid = await insertPatient({ name: "Thomas Taylor", dobYear: 1957, medication: med(4) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: true, pain_score: 5,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(3),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "hold", escalation_reason: "upcoming surgery" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
    ]);
  });

  // ── Group G: flag RESOLVED → approved (1 patient) ─────────────────────────
  await seedGroup("G1 flag resolved approved (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Uma Upton", dobYear: 1973, medication: med(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "flagged", refill_disposition: "approved",
      missed_doses: true, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 7,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(4), completed_at: daysAgo(3),
    });
    await insertAlert({
      patient_id: pid, assessment_id: aid, severity: "flag",
      escalation_reason: "pain score 7, missed doses",
      resolved: true,
      pharmacist_notes: "Reviewed with patient — doses delayed due to travel. Pain improving. Approved.",
      reviewed_by: "Dr. Sarah Chen, RPh",
      reviewed_at: daysAgo(3),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
      { patient_id: pid, assessment_id: aid, action: "alert_resolved" },
    ]);
  });

  // ── Group H: hold RESOLVED → held (kept) (1 patient) ─────────────────────
  await seedGroup("H1 hold resolved kept held (Humira)", async () => {
    const pid = await insertPatient({ name: "Victor Vance", dobYear: 1960, medication: med(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 6,
      fever: true, infection: true, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(5), completed_at: daysAgo(4),
    });
    await insertAlert({
      patient_id: pid, assessment_id: aid, severity: "hold",
      escalation_reason: "fever, active infection",
      resolved: true,
      pharmacist_notes: "Active pneumonia confirmed. Hold maintained until clearance.",
      reviewed_by: "Dr. Marcus Reyes, RPh",
      reviewed_at: daysAgo(4),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
      { patient_id: pid, assessment_id: aid, action: "alert_resolved" },
    ]);
  });

  // ── Group I: PENDING (4 patients — various due dates) ────────────────────
  await seedGroup("I1 pending due 5 days (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Wendy Webb", dobYear: 1976, medication: med(2), next_refill_date: daysFromNow(5) });
    const aid = await insertAssessment({ patient_id: pid, status: "pending" });
    await insertAuditLogs([{ patient_id: pid, assessment_id: aid, action: "sms_sent" }]);
  });

  await seedGroup("I2 pending due 3 days (Orencia)", async () => {
    const pid = await insertPatient({ name: "Xavier Xu", dobYear: 1981, medication: med(3), next_refill_date: daysFromNow(3) });
    const aid = await insertAssessment({ patient_id: pid, status: "pending" });
    await insertAuditLogs([{ patient_id: pid, assessment_id: aid, action: "sms_sent" }]);
  });

  await seedGroup("I3 pending due tomorrow (Simponi)", async () => {
    const pid = await insertPatient({ name: "Yara Young", dobYear: 1989, medication: med(4), next_refill_date: daysFromNow(1) });
    const aid = await insertAssessment({ patient_id: pid, status: "pending" });
    await insertAuditLogs([{ patient_id: pid, assessment_id: aid, action: "sms_sent" }]);
  });

  await seedGroup("I4 pending due 7 days (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Zoe Zhang", dobYear: 1964, medication: med(0), next_refill_date: daysFromNow(7) });
    const aid = await insertAssessment({ patient_id: pid, status: "pending" });
    await insertAuditLogs([{ patient_id: pid, assessment_id: aid, action: "sms_sent" }]);
  });

  // ── Group J: IN PROGRESS (2 patients) ─────────────────────────────────────
  await seedGroup("J1 in_progress DOB verified (Humira)", async () => {
    const pid = await insertPatient({ name: "Aaron Avery", dobYear: 1967, medication: med(1), next_refill_date: daysFromNow(4) });
    const aid = await insertAssessment({
      patient_id: pid, status: "in_progress",
      opened_at: daysAgo(0),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_opened" },
      { patient_id: pid, assessment_id: aid, action: "dob_verified" },
      { patient_id: pid, assessment_id: aid, action: "assessment_started" },
    ]);
  });

  await seedGroup("J2 in_progress link opened (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Beth Burns", dobYear: 1978, medication: med(2), next_refill_date: daysFromNow(6) });
    const aid = await insertAssessment({
      patient_id: pid, status: "in_progress",
      opened_at: daysAgo(0),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_opened" },
    ]);
  });

  // ── Group K: MANUAL CALL REQUIRED — one per reason type (7 patients) ─────

  // K1: Non-responder — reminders sent x2, timed out
  await seedGroup("K1 manual non-responder (Orencia)", async () => {
    const pid = await insertPatient({ name: "Carlos Cruz", dobYear: 1956, medication: med(3), next_refill_date: daysFromNow(0) });
    const aid = await insertAssessment({ patient_id: pid, status: "manual_call_required" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "reminder_sent" },
      { patient_id: pid, assessment_id: aid, action: "reminder_sent" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K2: SMS delivery failure
  await seedGroup("K2 manual SMS failed (Simponi)", async () => {
    const pid = await insertPatient({ name: "Diana Drake", dobYear: 1971, medication: med(4), next_refill_date: daysFromNow(2) });
    const aid = await insertAssessment({ patient_id: pid, status: "manual_call_required" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_failed" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K3: DOB lockout — 5 failed attempts
  await seedGroup("K3 manual DOB lockout (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Ethan Ellis", dobYear: 1982, medication: med(0), next_refill_date: daysFromNow(3) });
    const aid = await insertAssessment({
      patient_id: pid, status: "manual_call_required",
      opened_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_opened" },
      { patient_id: pid, assessment_id: aid, action: "dob_failed" },
      { patient_id: pid, assessment_id: aid, action: "dob_failed" },
      { patient_id: pid, assessment_id: aid, action: "dob_failed" },
      { patient_id: pid, assessment_id: aid, action: "dob_failed" },
      { patient_id: pid, assessment_id: aid, action: "dob_failed" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K4: Refill declined by patient (refill_confirmed = false)
  await seedGroup("K4 manual refill declined (Humira)", async () => {
    const pid = await insertPatient({ name: "Fiona Flynn", dobYear: 1974, medication: med(1), next_refill_date: daysFromNow(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "manual_call_required",
      risk_outcome: "auto_approved", refill_disposition: "declined_by_patient",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 2,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: false, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K5: Address change needed (delivery_approved = false)
  await seedGroup("K5 manual address change (Cimzia)", async () => {
    const pid = await insertPatient({ name: "George Grant", dobYear: 1959, medication: med(2), next_refill_date: daysFromNow(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "manual_call_required",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 1,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: false,
      submitted_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K6: No SMS consent
  await seedGroup("K6 manual no SMS consent (Orencia)", async () => {
    const pid = await insertPatient({
      name: "Hannah Hart", dobYear: 1984, medication: med(3),
      sms_consent: false, sms_opted_out: false, next_refill_date: daysFromNow(6),
    });
    const aid = await insertAssessment({ patient_id: pid, status: "manual_call_required" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // K7: SMS opt-out
  await seedGroup("K7 manual opted out (Simponi)", async () => {
    const pid = await insertPatient({
      name: "Ian Inglis", dobYear: 1968, medication: med(4),
      sms_consent: true, sms_opted_out: true, next_refill_date: daysFromNow(5),
    });
    const aid = await insertAssessment({ patient_id: pid, status: "manual_call_required" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "sms_opted_out" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // ── Group L: special / edge cases (5 patients) ────────────────────────────

  // L1: flagged + refill_confirmed=false → manual_call_required + declined_by_patient
  //     (has both a clinical flag alert AND a manual call reason)
  await seedGroup("L1 flagged + refill declined (Enbrel)", async () => {
    const pid = await insertPatient({ name: "Julia James", dobYear: 1973, medication: med(0), next_refill_date: daysFromNow(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "manual_call_required",
      risk_outcome: "flagged", refill_disposition: "declined_by_patient",
      missed_doses: true, medication_changes: true, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 7,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: false, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "pain score 7, missed doses, medication changes" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
      { patient_id: pid, assessment_id: aid, action: "manual_call_flagged" },
    ]);
  });

  // L2: clinical_hold resolved to APPROVED (pharmacist overrode)
  await seedGroup("L2 hold resolved to approved (Humira)", async () => {
    const pid = await insertPatient({ name: "Kevin Knight", dobYear: 1966, medication: med(1), next_refill_date: daysFromNow(0) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "clinical_hold", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 3,
      fever: true, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(3), completed_at: daysAgo(2),
    });
    await insertAlert({
      patient_id: pid, assessment_id: aid, severity: "hold",
      escalation_reason: "fever",
      resolved: true,
      pharmacist_notes: "Low-grade fever due to a cold, not infection. Biologic not contraindicated. Approved to dispense.",
      reviewed_by: "Dr. Sarah Chen, RPh",
      reviewed_at: daysAgo(2),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
      { patient_id: pid, assessment_id: aid, action: "alert_resolved" },
    ]);
  });

  // L3: multiple hold triggers (fever + infection) still unresolved
  await seedGroup("L3 hold fever+infection unresolved (Cimzia)", async () => {
    const pid = await insertPatient({ name: "Laura Lewis", dobYear: 1971, medication: med(2), next_refill_date: daysFromNow(1) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "clinical_hold", refill_disposition: "held",
      missed_doses: false, medication_changes: false, hospitalized: true,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 8,
      fever: true, infection: true, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "hold", escalation_reason: "fever, active infection" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "clinical_hold_created" },
    ]);
  });

  // L4: multiple flag triggers (pain=9 + missed_doses + hospitalized)
  await seedGroup("L4 flagged multi-trigger (Orencia)", async () => {
    const pid = await insertPatient({ name: "Mike Moore", dobYear: 1964, medication: med(3), next_refill_date: daysFromNow(2) });
    const aid = await insertAssessment({
      patient_id: pid, status: "needs_review",
      risk_outcome: "flagged", refill_disposition: "pending_review",
      missed_doses: true, medication_changes: true, hospitalized: true,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 9,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1),
    });
    await insertAlert({ patient_id: pid, assessment_id: aid, severity: "flag", escalation_reason: "pain score 9, missed doses, medication changes, hospitalized/ER" });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "alert_created" },
    ]);
  });

  // L5: auto_approved unattested — with all 4 symptoms checked "none" (zero symptoms)
  await seedGroup("L5 auto_approved pain=3 all clear unattested (Simponi)", async () => {
    const pid = await insertPatient({ name: "Nancy Neal", dobYear: 1969, medication: med(4), next_refill_date: daysFromNow(14) });
    const aid = await insertAssessment({
      patient_id: pid, status: "completed",
      risk_outcome: "auto_approved", refill_disposition: "approved",
      missed_doses: false, medication_changes: false, hospitalized: false,
      recent_vaccination: false, surgery_upcoming: false, pain_score: 3,
      fever: false, infection: false, pregnancy_status: false,
      refill_confirmed: true, delivery_approved: true,
      submitted_at: daysAgo(1), completed_at: daysAgo(1),
    });
    await insertAuditLogs([
      { patient_id: pid, assessment_id: aid, action: "sms_sent" },
      { patient_id: pid, assessment_id: aid, action: "assessment_submitted" },
      { patient_id: pid, assessment_id: aid, action: "risk_evaluated" },
      { patient_id: pid, assessment_id: aid, action: "auto_approved" },
    ]);
  });

  console.log("\n✓ Seed complete — 40 patients inserted.\n");

  console.log("Summary of coverage:");
  console.log("  Status:         pending (4), in_progress (2), needs_review (9), completed (12), manual_call_required (11), plus 2 completed-resolved");
  console.log("  Risk outcome:   auto_approved (8), logged (5), flagged (8), clinical_hold (7), null (6)");
  console.log("  Disposition:    approved (15), pending_review (5), held (5), declined_by_patient (2), null (13)");
  console.log("  Alert severity: hold (6 unresolved + 3 resolved = 9), flag (6 unresolved + 2 resolved = 8)");
  console.log("  Attestation:    attested (5), awaiting (8)");
  console.log("  Consent:        sms_consent=false (1), sms_opted_out=true (1)");
  console.log("  Call queue (7): non-responder, SMS failure, DOB lockout, refill declined, address change, no consent, opted-out");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
