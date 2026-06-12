import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import { sendAssessmentSms } from "@/lib/sms";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const baseUrl = `${proto}://${host}`;

  const db = createServerClient();
  const now = new Date();

  const summary = {
    dispatched: 0,
    manual_dispatch_required: 0,
    reminders_sent: 0,
    timedout: 0,
    errors: [] as string[],
  };

  // ── (a) Auto-dispatch: refill_date = today + 7 days ───────────────────────
  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + 7);
  const targetDateStr = targetDate.toISOString().slice(0, 10);

  const { data: patients } = await db
    .from("patients")
    .select("id, full_name, phone, sms_consent, sms_opted_out")
    .eq("next_refill_date", targetDateStr);

  for (const patient of patients ?? []) {
    // Skip if a non-terminal assessment already exists
    const { count: openCount } = await db
      .from("assessments")
      .select("*", { count: "exact", head: true })
      .eq("patient_id", patient.id)
      .in("status", ["pending", "in_progress", "needs_review"]);

    if ((openCount ?? 0) > 0) continue;

    const { data: newAssessment, error: assErr } = await db
      .from("assessments")
      .insert({ patient_id: patient.id, status: "pending" })
      .select("id")
      .single();

    if (assErr || !newAssessment) {
      summary.errors.push(`dispatch patient ${patient.id}: ${assErr?.message ?? "no data"}`);
      continue;
    }

    const assessmentId = newAssessment.id;

    if (!patient.sms_consent || patient.sms_opted_out) {
      await db
        .from("assessments")
        .update({ status: "manual_call_required" })
        .eq("id", assessmentId);
      await db.from("audit_logs").insert({
        patient_id: patient.id,
        assessment_id: assessmentId,
        action: "manual_call_flagged",
      });
      summary.manual_dispatch_required++;
      continue;
    }

    const tokenStr = randomBytes(48).toString("hex");
    const expiresAt = new Date(now.getTime() + 96 * 60 * 60 * 1000).toISOString();

    const { error: tokenErr } = await db
      .from("assessment_tokens")
      .insert({ assessment_id: assessmentId, token: tokenStr, expires_at: expiresAt });

    if (tokenErr) {
      summary.errors.push(`token patient ${patient.id}: ${tokenErr.message}`);
      continue;
    }

    const result = await sendAssessmentSms(patient, tokenStr, baseUrl);

    if (result.sent) {
      await db.from("audit_logs").insert({
        patient_id: patient.id,
        assessment_id: assessmentId,
        action: "sms_sent",
      });
      summary.dispatched++;
    } else {
      await db
        .from("assessments")
        .update({ status: "manual_call_required" })
        .eq("id", assessmentId);
      await db.from("audit_logs").insert([
        { patient_id: patient.id, assessment_id: assessmentId, action: "sms_failed" as const },
        { patient_id: patient.id, assessment_id: assessmentId, action: "manual_call_flagged" as const },
      ]);
      summary.manual_dispatch_required++;
    }
  }

  // ── (b) Reminders ──────────────────────────────────────────────────────────
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff72h = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

  const { data: pendingAssessments } = await db
    .from("assessments")
    .select("id, patient_id, created_at")
    .in("status", ["pending", "in_progress"])
    .gte("created_at", cutoff72h)
    .lt("created_at", cutoff24h);

  for (const assessment of pendingAssessments ?? []) {
    const ageMs = now.getTime() - new Date(assessment.created_at).getTime();
    const h24 = 24 * 60 * 60 * 1000;
    const h48 = 48 * 60 * 60 * 1000;

    const { count: reminderCount } = await db
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("assessment_id", assessment.id)
      .eq("action", "reminder_sent");

    const count = reminderCount ?? 0;
    const isDay2 = ageMs >= h24 && ageMs < h48 && count === 0;
    const isDay3 = ageMs >= h48 && count === 1;

    if (!isDay2 && !isDay3) continue;

    const { data: patient } = await db
      .from("patients")
      .select("id, full_name, phone, sms_consent, sms_opted_out")
      .eq("id", assessment.patient_id)
      .single();

    if (!patient) continue;

    // Find an active (unused, unexpired) token for this assessment
    const { data: tokenRow } = await db
      .from("assessment_tokens")
      .select("token")
      .eq("assessment_id", assessment.id)
      .eq("used", false)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) continue;

    const result = await sendAssessmentSms(patient, tokenRow.token, baseUrl);
    if (result.sent) {
      await db.from("audit_logs").insert({
        patient_id: patient.id,
        assessment_id: assessment.id,
        action: "reminder_sent",
      });
      summary.reminders_sent++;
    }
  }

  // ── (c) Timeouts: pending/in_progress older than 72h ──────────────────────
  const { data: timedOut } = await db
    .from("assessments")
    .select("id, patient_id")
    .in("status", ["pending", "in_progress"])
    .lt("created_at", cutoff72h);

  for (const assessment of timedOut ?? []) {
    await db
      .from("assessments")
      .update({ status: "manual_call_required" })
      .eq("id", assessment.id);
    await db.from("audit_logs").insert({
      patient_id: assessment.patient_id,
      assessment_id: assessment.id,
      action: "manual_call_flagged",
    });
    summary.timedout++;
  }

  return NextResponse.json({ ok: true, ...summary });
}
