"use server";

import { createServerClient } from "@/lib/supabase/server";
import type { AuditAction } from "@/types/index";

async function logAudit(
  patientId: string,
  assessmentId: string,
  action: AuditAction
): Promise<void> {
  const db = createServerClient();
  await db
    .from("audit_logs")
    .insert({ patient_id: patientId, assessment_id: assessmentId, action });
}

export type VerifyDobResult =
  | { ok: true }
  | { ok: false; locked: boolean; message: string };

export async function verifyDob(
  assessmentId: string,
  dob: string
): Promise<VerifyDobResult> {
  const db = createServerClient();

  const { data: assessment } = await db
    .from("assessments")
    .select("id, patient_id, status")
    .eq("id", assessmentId)
    .single();

  if (!assessment) {
    return {
      ok: false,
      locked: false,
      message: "Session expired. Please call your pharmacy.",
    };
  }

  // Use audit log count as the server-side attempt counter.
  const { count: failCount } = await db
    .from("audit_logs")
    .select("*", { count: "exact", head: true })
    .eq("assessment_id", assessmentId)
    .eq("action", "dob_failed");

  if ((failCount ?? 0) >= 5) {
    return {
      ok: false,
      locked: true,
      message:
        "Too many failed attempts. Please call your pharmacy for assistance.",
    };
  }

  const { data: patient } = await db
    .from("patients")
    .select("dob")
    .eq("id", assessment.patient_id)
    .single();

  if (!patient) {
    return {
      ok: false,
      locked: false,
      message: "Session expired. Please call your pharmacy.",
    };
  }

  if (patient.dob !== dob) {
    await logAudit(assessment.patient_id, assessmentId, "dob_failed");
    const newCount = (failCount ?? 0) + 1;

    if (newCount >= 5) {
      // Invalidate token and escalate to technician queue.
      await db
        .from("assessment_tokens")
        .update({ used: true })
        .eq("assessment_id", assessmentId);
      await db
        .from("assessments")
        .update({ status: "manual_call_required" })
        .eq("id", assessmentId);
      return {
        ok: false,
        locked: true,
        message:
          "Too many failed attempts. Please call your pharmacy for assistance.",
      };
    }

    return {
      ok: false,
      locked: false,
      message:
        "We couldn't verify your information. Please check your date of birth and try again.",
    };
  }

  await logAudit(assessment.patient_id, assessmentId, "dob_verified");
  await logAudit(assessment.patient_id, assessmentId, "assessment_started");
  return { ok: true };
}

export type AssessmentAnswers = {
  missed_doses: boolean;
  medication_changes: boolean;
  surgery_upcoming: boolean;
  pain_score: number;
  fever: boolean;
  infection: boolean;
  pregnancy_status: boolean;
  refill_confirmed: boolean;
  delivery_approved: boolean;
};

export async function submitAssessment(
  assessmentId: string,
  tokenId: string,
  answers: AssessmentAnswers
): Promise<{ ok: boolean; error?: string }> {
  const db = createServerClient();

  // Re-validate token before writing.
  const { data: tokenRow } = await db
    .from("assessment_tokens")
    .select("id, assessment_id, used, expires_at")
    .eq("id", tokenId)
    .single();

  if (
    !tokenRow ||
    tokenRow.used ||
    new Date(tokenRow.expires_at) < new Date()
  ) {
    return {
      ok: false,
      error: "This link is no longer valid. Please call your pharmacy.",
    };
  }

  const { data: assessment } = await db
    .from("assessments")
    .select("patient_id")
    .eq("id", assessmentId)
    .single();

  if (!assessment) {
    return { ok: false, error: "Session expired. Please call your pharmacy." };
  }

  const { error: updateErr } = await db
    .from("assessments")
    .update({
      missed_doses: answers.missed_doses,
      medication_changes: answers.medication_changes,
      surgery_upcoming: answers.surgery_upcoming,
      pain_score: answers.pain_score,
      fever: answers.fever,
      infection: answers.infection,
      pregnancy_status: answers.pregnancy_status,
      refill_confirmed: answers.refill_confirmed,
      delivery_approved: answers.delivery_approved,
      submitted_at: new Date().toISOString(),
      status: "needs_review",
    })
    .eq("id", assessmentId);

  if (updateErr) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  await db
    .from("assessment_tokens")
    .update({ used: true })
    .eq("id", tokenId);

  await logAudit(assessment.patient_id, assessmentId, "assessment_submitted");

  return { ok: true };
}
