"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { randomBytes } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { sendAssessmentSms } from "@/lib/sms";
import type {
  AssessmentStatus,
  RiskOutcome,
  RefillDisposition,
  AlertSeverity,
  PdfData,
} from "@/types/index";

// ── Return types ──────────────────────────────────────────────────────────────

export type AssessmentRow = {
  id: string;
  patient_id: string;
  patient_name: string;
  medication: string;
  status: AssessmentStatus;
  risk_outcome: RiskOutcome | null;
  refill_disposition: RefillDisposition | null;
  escalation_reason: string | null;
  submitted_at: string | null;
  sms_consent: boolean;
  sms_opted_out: boolean;
  attested_by: string | null;
};

export type PatientRow = {
  id: string;
  full_name: string;
  medication: string;
  phone: string;
  next_refill_date: string;
  sms_consent: boolean;
  sms_opted_out: boolean;
  has_open_assessment: boolean;
};

export type EscalationRow = {
  alert_id: string;
  assessment_id: string;
  patient_id: string;
  patient_name: string;
  medication: string;
  severity: AlertSeverity;
  escalation_reason: string;
  pharmacist_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolved: boolean;
  current_disposition: RefillDisposition | null;
  created_at: string;
};

export type CallQueueRow = {
  assessment_id: string;
  patient_id: string;
  patient_name: string;
  medication: string;
  phone: string;
  call_reason: string;
  created_at: string;
};

export type AttestationRow = {
  assessment_id: string;
  patient_id: string;
  patient_name: string;
  medication: string;
  risk_outcome: RiskOutcome;
  submitted_at: string | null;
  pain_score: number | null;
};

export type DashboardData = {
  assessments: AssessmentRow[];
  patients: PatientRow[];
  escalation: EscalationRow[];
  attestation: AttestationRow[];
  callQueue: CallQueueRow[];
};

// ── Private helpers ───────────────────────────────────────────────────────────

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return null;
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime());
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

// ── Main dashboard data fetch ─────────────────────────────────────────────────

export async function fetchDashboardData(): Promise<DashboardData> {
  const db = createServerClient();

  const [
    { data: assessments },
    { data: patients },
    { data: alerts },
  ] = await Promise.all([
    db.from("assessments").select("*").order("created_at", { ascending: false }),
    db.from("patients").select("*").order("full_name", { ascending: true }),
    db.from("alerts").select("*").order("created_at", { ascending: true }),
  ]);

  const patientMap = new Map((patients ?? []).map((p) => [p.id, p]));

  // First alert per assessment (for escalation_reason column in assessment table)
  const alertByAssessment = new Map<string, NonNullable<typeof alerts>[number]>();
  for (const al of alerts ?? []) {
    if (!alertByAssessment.has(al.assessment_id)) {
      alertByAssessment.set(al.assessment_id, al);
    }
  }

  // ── Assessment rows ────────────────────────────────────────────────────────
  const assessmentRows: AssessmentRow[] = (assessments ?? []).map((a) => {
    const p = patientMap.get(a.patient_id);
    const alert = alertByAssessment.get(a.id);
    return {
      id: a.id,
      patient_id: a.patient_id,
      patient_name: p?.full_name ?? "Unknown",
      medication: p?.medication ?? "Unknown",
      status: a.status,
      risk_outcome: a.risk_outcome,
      refill_disposition: a.refill_disposition,
      escalation_reason: alert?.escalation_reason ?? null,
      submitted_at: a.submitted_at,
      sms_consent: p?.sms_consent ?? false,
      sms_opted_out: p?.sms_opted_out ?? false,
      attested_by: a.attested_by,
    };
  });

  // ── Patient rows (for per-patient SMS dispatch section) ────────────────────
  const openAssessmentPatients = new Set(
    (assessments ?? [])
      .filter((a) =>
        (["pending", "in_progress", "needs_review"] as AssessmentStatus[]).includes(a.status)
      )
      .map((a) => a.patient_id)
  );

  const patientRows: PatientRow[] = (patients ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    medication: p.medication,
    phone: p.phone,
    next_refill_date: p.next_refill_date,
    sms_consent: p.sms_consent,
    sms_opted_out: p.sms_opted_out,
    has_open_assessment: openAssessmentPatients.has(p.id),
  }));

  // ── Escalation rows (unresolved only, holds before flags) ─────────────────
  const unresolvedAlerts = (alerts ?? [])
    .filter((al) => !al.resolved)
    .sort((a, b) => {
      if (a.severity === "hold" && b.severity === "flag") return -1;
      if (a.severity === "flag" && b.severity === "hold") return 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const escalationRows: EscalationRow[] = unresolvedAlerts.map((al) => {
    const p = patientMap.get(al.patient_id);
    const assessment = (assessments ?? []).find((a) => a.id === al.assessment_id);
    return {
      alert_id: al.id,
      assessment_id: al.assessment_id,
      patient_id: al.patient_id,
      patient_name: p?.full_name ?? "Unknown",
      medication: p?.medication ?? "Unknown",
      severity: al.severity,
      escalation_reason: al.escalation_reason,
      pharmacist_notes: al.pharmacist_notes,
      reviewed_by: al.reviewed_by,
      reviewed_at: al.reviewed_at,
      resolved: al.resolved,
      current_disposition: assessment?.refill_disposition ?? null,
      created_at: al.created_at,
    };
  });

  // ── Attestation rows (completed, auto_approved or logged, not yet attested) ─
  const attestationRows: AttestationRow[] = (assessments ?? [])
    .filter(
      (a) =>
        a.status === "completed" &&
        (a.risk_outcome === "auto_approved" || a.risk_outcome === "logged") &&
        a.attested_by === null
    )
    .sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    .map((a) => {
      const p = patientMap.get(a.patient_id);
      return {
        assessment_id: a.id,
        patient_id: a.patient_id,
        patient_name: p?.full_name ?? "Unknown",
        medication: p?.medication ?? "Unknown",
        risk_outcome: a.risk_outcome as RiskOutcome,
        submitted_at: a.submitted_at,
        pain_score: a.pain_score,
      };
    });

  // ── Call queue rows (manual_call_required with derived reason) ────────────
  const manualAssessments = (assessments ?? []).filter(
    (a) => a.status === "manual_call_required"
  );

  let auditLogs: Array<{ assessment_id: string | null; action: string }> = [];
  if (manualAssessments.length > 0) {
    const ids = manualAssessments.map((a) => a.id);
    const { data: logs } = await db
      .from("audit_logs")
      .select("assessment_id, action")
      .in("assessment_id", ids);
    auditLogs = logs ?? [];
  }

  const auditByAssessment = new Map<string, string[]>();
  for (const log of auditLogs) {
    if (log.assessment_id) {
      const list = auditByAssessment.get(log.assessment_id) ?? [];
      list.push(log.action);
      auditByAssessment.set(log.assessment_id, list);
    }
  }

  const callQueueRows: CallQueueRow[] = manualAssessments.map((a) => {
    const p = patientMap.get(a.patient_id);
    const actions = auditByAssessment.get(a.id) ?? [];

    let call_reason: string;
    if (!p?.sms_consent) {
      call_reason = "No SMS consent";
    } else if (p?.sms_opted_out) {
      call_reason = "SMS opt-out";
    } else if (actions.filter((x) => x === "dob_failed").length >= 5) {
      call_reason = "DOB lockout";
    } else if (actions.includes("sms_failed")) {
      call_reason = "SMS delivery failure";
    } else if (a.refill_confirmed === false) {
      call_reason = "Refill declined by patient";
    } else if (a.delivery_approved === false) {
      call_reason = "Address change needed";
    } else {
      call_reason = "Non-responder";
    }

    return {
      assessment_id: a.id,
      patient_id: a.patient_id,
      patient_name: p?.full_name ?? "Unknown",
      medication: p?.medication ?? "Unknown",
      phone: p?.phone ?? "",
      call_reason,
      created_at: a.created_at,
    };
  });

  return {
    assessments: assessmentRows,
    patients: patientRows,
    escalation: escalationRows,
    attestation: attestationRows,
    callQueue: callQueueRows,
  };
}

// ── CSV import ────────────────────────────────────────────────────────────────

export async function importPatientsCsv(formData: FormData): Promise<{
  inserted: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
}> {
  const file = formData.get("csv") as File | null;
  if (!file) {
    return { inserted: 0, rejected: 0, errors: [{ row: 0, reason: "No file provided" }] };
  }

  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { inserted: 0, rejected: 0, errors: [{ row: 0, reason: "File has no data rows" }] };
  }

  const dataRowCount = lines.length - 1;
  const errors: Array<{ row: number; reason: string }> = [];
  type InsertRow = {
    full_name: string;
    dob: string;
    phone: string;
    medication: string;
    disease_state: string;
    next_refill_date: string;
    sms_consent: boolean;
    sms_opted_out: boolean;
    rowNum: number;
  };
  const toInsert: InsertRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i;
    const cols = parseCSVLine(lines[i]);

    if (cols.length < 7) {
      errors.push({ row: rowNum, reason: `Expected 7 columns, got ${cols.length}` });
      continue;
    }

    const [rawName, rawDob, rawPhone, rawMed, rawDisease, rawRefill, rawConsent] = cols;
    const rowErrors: string[] = [];

    const full_name = rawName.trim();
    if (!full_name) rowErrors.push("full_name is required");

    const dob = rawDob.trim();
    if (!dob) rowErrors.push("dob is required");
    else if (!isValidDate(dob)) rowErrors.push(`dob "${dob}" must be YYYY-MM-DD`);

    const phone = normalizePhone(rawPhone.trim());
    if (!phone) rowErrors.push(`phone "${rawPhone.trim()}" cannot be normalized to E.164`);

    const medication = rawMed.trim();
    if (!medication) rowErrors.push("medication is required");

    const disease_state = rawDisease.trim();
    if (!disease_state) rowErrors.push("disease_state is required");

    const next_refill_date = rawRefill.trim();
    if (!next_refill_date) rowErrors.push("next_refill_date is required");
    else if (!isValidDate(next_refill_date))
      rowErrors.push(`next_refill_date "${next_refill_date}" must be YYYY-MM-DD`);

    const consentRaw = rawConsent.trim().toLowerCase();
    if (consentRaw !== "yes" && consentRaw !== "no")
      rowErrors.push(`sms_consent must be "yes" or "no", got "${consentRaw}"`);

    if (rowErrors.length > 0) {
      errors.push({ row: rowNum, reason: rowErrors.join("; ") });
      continue;
    }

    toInsert.push({
      full_name,
      dob,
      phone: phone!,
      medication,
      disease_state,
      next_refill_date,
      sms_consent: consentRaw === "yes",
      sms_opted_out: false,
      rowNum,
    });
  }

  const db = createServerClient();
  let inserted = 0;

  for (const row of toInsert) {
    const { rowNum, ...dbRow } = row;
    const { error } = await db.from("patients").insert(dbRow);
    if (error) {
      errors.push({ row: rowNum, reason: `Database error: ${error.message}` });
    } else {
      inserted++;
    }
  }

  revalidatePath("/");
  return { inserted, rejected: dataRowCount - inserted, errors };
}

// ── SMS dispatch: per patient ─────────────────────────────────────────────────

export async function dispatchSmsToPatient(patientId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const db = createServerClient();
  const baseUrl = await getBaseUrl();

  const { data: patient } = await db
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .single();

  if (!patient) return { ok: false, reason: "Patient not found" };
  if (!patient.sms_consent) return { ok: false, reason: "No SMS consent on file" };
  if (patient.sms_opted_out) return { ok: false, reason: "Patient has opted out of SMS" };

  const { count: openCount } = await db
    .from("assessments")
    .select("*", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .in("status", ["pending", "in_progress", "needs_review"]);

  if ((openCount ?? 0) > 0) {
    return { ok: false, reason: "Patient already has an open assessment" };
  }

  const { data: assessment, error: assErr } = await db
    .from("assessments")
    .insert({ patient_id: patientId, status: "pending" })
    .select("id")
    .single();

  if (assErr || !assessment) return { ok: false, reason: "Failed to create assessment" };

  const tokenStr = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();

  const { error: tokenErr } = await db.from("assessment_tokens").insert({
    assessment_id: assessment.id,
    token: tokenStr,
    expires_at: expiresAt,
    used: false,
  });

  if (tokenErr) return { ok: false, reason: "Failed to create token" };

  const result = await sendAssessmentSms(patient, tokenStr, baseUrl);

  if (result.sent) {
    await db.from("audit_logs").insert({
      patient_id: patientId,
      assessment_id: assessment.id,
      action: "sms_sent",
    });
    revalidatePath("/");
    return { ok: true };
  }

  await db
    .from("assessments")
    .update({ status: "manual_call_required" })
    .eq("id", assessment.id);
  await db.from("audit_logs").insert([
    { patient_id: patientId, assessment_id: assessment.id, action: "sms_failed" },
    { patient_id: patientId, assessment_id: assessment.id, action: "manual_call_flagged" },
  ]);
  revalidatePath("/");
  return { ok: false, reason: result.reason ?? "SMS delivery failed" };
}

// ── SMS dispatch: send all due ────────────────────────────────────────────────

export async function dispatchAllDueSms(): Promise<{
  sent: number;
  manual: number;
  skipped: number;
  errors: string[];
}> {
  const db = createServerClient();
  const baseUrl = await getBaseUrl();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const sevenDays = new Date(today);
  sevenDays.setDate(today.getDate() + 7);
  const sevenDayStr = sevenDays.toISOString().slice(0, 10);

  const { data: patients } = await db
    .from("patients")
    .select("*")
    .gte("next_refill_date", todayStr)
    .lte("next_refill_date", sevenDayStr);

  let sent = 0;
  let manual = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const patient of patients ?? []) {
    const { count: openCount } = await db
      .from("assessments")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient.id)
      .in("status", ["pending", "in_progress", "needs_review"]);

    if ((openCount ?? 0) > 0) {
      skipped++;
      continue;
    }

    const { data: assessment, error: assErr } = await db
      .from("assessments")
      .insert({ patient_id: patient.id, status: "pending" })
      .select("id")
      .single();

    if (assErr || !assessment) {
      errors.push(`${patient.full_name}: failed to create assessment`);
      continue;
    }

    if (!patient.sms_consent || patient.sms_opted_out) {
      await db
        .from("assessments")
        .update({ status: "manual_call_required" })
        .eq("id", assessment.id);
      await db.from("audit_logs").insert({
        patient_id: patient.id,
        assessment_id: assessment.id,
        action: "manual_call_flagged",
      });
      manual++;
      continue;
    }

    const tokenStr = randomBytes(48).toString("hex");
    const expiresAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
    await db.from("assessment_tokens").insert({
      assessment_id: assessment.id,
      token: tokenStr,
      expires_at: expiresAt,
      used: false,
    });

    const result = await sendAssessmentSms(patient, tokenStr, baseUrl);

    if (result.sent) {
      await db.from("audit_logs").insert({
        patient_id: patient.id,
        assessment_id: assessment.id,
        action: "sms_sent",
      });
      sent++;
    } else {
      await db
        .from("assessments")
        .update({ status: "manual_call_required" })
        .eq("id", assessment.id);
      await db.from("audit_logs").insert([
        { patient_id: patient.id, assessment_id: assessment.id, action: "sms_failed" },
        { patient_id: patient.id, assessment_id: assessment.id, action: "manual_call_flagged" },
      ]);
      manual++;
      errors.push(`${patient.full_name}: SMS failed — ${result.reason}`);
    }
  }

  revalidatePath("/");
  return { sent, manual, skipped, errors };
}

// ── Resolve alert ─────────────────────────────────────────────────────────────

export async function resolveAlert(
  alertId: string,
  assessmentId: string,
  disposition: "approved" | "held",
  notes: string,
  reviewedBy: string
): Promise<{ ok: boolean; error?: string }> {
  if (!reviewedBy.trim()) return { ok: false, error: "Reviewed by is required" };

  const db = createServerClient();

  const { data: assessment } = await db
    .from("assessments")
    .select("patient_id")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return { ok: false, error: "Assessment not found" };

  const { error: alertErr } = await db
    .from("alerts")
    .update({
      resolved: true,
      pharmacist_notes: notes.trim() || null,
      reviewed_by: reviewedBy.trim(),
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", alertId);

  if (alertErr) return { ok: false, error: alertErr.message };

  const { error: assErr } = await db
    .from("assessments")
    .update({ refill_disposition: disposition, status: "completed" })
    .eq("id", assessmentId);

  if (assErr) return { ok: false, error: assErr.message };

  await db.from("audit_logs").insert({
    patient_id: assessment.patient_id,
    assessment_id: assessmentId,
    action: "alert_resolved",
  });

  revalidatePath("/");
  return { ok: true };
}

// ── Attest single assessment ──────────────────────────────────────────────────

export async function attestAssessment(
  assessmentId: string,
  attestedBy: string
): Promise<{ ok: boolean; error?: string }> {
  if (!attestedBy.trim()) return { ok: false, error: "Name is required" };

  const db = createServerClient();

  const { data: assessment } = await db
    .from("assessments")
    .select("patient_id")
    .eq("id", assessmentId)
    .single();

  if (!assessment) return { ok: false, error: "Assessment not found" };

  const { error } = await db
    .from("assessments")
    .update({ attested_by: attestedBy.trim(), attested_at: new Date().toISOString() })
    .eq("id", assessmentId);

  if (error) return { ok: false, error: error.message };

  await db.from("audit_logs").insert({
    patient_id: assessment.patient_id,
    assessment_id: assessmentId,
    action: "assessment_attested",
  });

  revalidatePath("/");
  return { ok: true };
}

// ── Fetch assessment data for PDF generation ──────────────────────────────────

export async function fetchAssessmentForPdf(
  assessmentId: string
): Promise<{ ok: true; data: PdfData } | { ok: false; error: string }> {
  const db = createServerClient();

  const { data: assessment, error: assErr } = await db
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single();

  if (assErr || !assessment) return { ok: false, error: "Assessment not found" };

  const { data: patient, error: patErr } = await db
    .from("patients")
    .select("full_name, dob, medication")
    .eq("id", assessment.patient_id)
    .single();

  if (patErr || !patient) return { ok: false, error: "Patient not found" };

  // Most recent alert for this assessment — resolved preferred, else unresolved
  const { data: resolvedAlert } = await db
    .from("alerts")
    .select("escalation_reason, pharmacist_notes, reviewed_by, reviewed_at")
    .eq("assessment_id", assessmentId)
    .eq("resolved", true)
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: anyAlert } = await db
    .from("alerts")
    .select("escalation_reason, pharmacist_notes, reviewed_by, reviewed_at")
    .eq("assessment_id", assessmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const alertData = resolvedAlert ?? anyAlert;

  await db.from("audit_logs").insert({
    patient_id: assessment.patient_id,
    assessment_id: assessmentId,
    action: "pdf_generated" as const,
  });

  return {
    ok: true,
    data: {
      full_name: patient.full_name,
      dob: patient.dob,
      medication: patient.medication,
      assessment_id: assessmentId,
      patient_id: assessment.patient_id,
      missed_doses: assessment.missed_doses,
      medication_changes: assessment.medication_changes,
      hospitalized: assessment.hospitalized,
      recent_vaccination: assessment.recent_vaccination,
      surgery_upcoming: assessment.surgery_upcoming,
      pain_score: assessment.pain_score,
      fever: assessment.fever,
      infection: assessment.infection,
      pregnancy_status: assessment.pregnancy_status,
      refill_confirmed: assessment.refill_confirmed,
      delivery_approved: assessment.delivery_approved,
      risk_outcome: assessment.risk_outcome,
      refill_disposition: assessment.refill_disposition,
      submitted_at: assessment.submitted_at,
      attested_by: assessment.attested_by,
      attested_at: assessment.attested_at,
      escalation_reason: alertData?.escalation_reason ?? null,
      pharmacist_notes: alertData?.pharmacist_notes ?? null,
      reviewed_by: alertData?.reviewed_by ?? null,
      reviewed_at: alertData?.reviewed_at ?? null,
    },
  };
}

// ── Attest all pending ────────────────────────────────────────────────────────

export async function attestAllAssessments(
  assessmentIds: string[],
  attestedBy: string
): Promise<{ ok: boolean; attested: number; error?: string }> {
  if (!attestedBy.trim()) return { ok: false, attested: 0, error: "Name is required" };
  if (assessmentIds.length === 0) return { ok: true, attested: 0 };

  const db = createServerClient();
  const now = new Date().toISOString();

  const { data: assessments } = await db
    .from("assessments")
    .select("id, patient_id")
    .in("id", assessmentIds);

  if (!assessments) return { ok: false, attested: 0, error: "Failed to fetch assessments" };

  const { error } = await db
    .from("assessments")
    .update({ attested_by: attestedBy.trim(), attested_at: now })
    .in("id", assessmentIds);

  if (error) return { ok: false, attested: 0, error: error.message };

  await db.from("audit_logs").insert(
    assessments.map((a) => ({
      patient_id: a.patient_id,
      assessment_id: a.id,
      action: "assessment_attested" as const,
    }))
  );

  revalidatePath("/");
  return { ok: true, attested: assessmentIds.length };
}
