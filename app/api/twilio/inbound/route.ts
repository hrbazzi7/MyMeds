import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { validateWebhookSignature } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const OPT_OUT_KEYWORDS = new Set(["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Twilio sends application/x-www-form-urlencoded
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Validate Twilio signature before any DB access
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/twilio/inbound`;

  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validateWebhookSignature(signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const body = (params["Body"] ?? "").trim().toUpperCase();
  const fromPhone = params["From"] ?? "";

  // Unrecognized inbound messages → 200, no action
  if (!OPT_OUT_KEYWORDS.has(body)) {
    return NextResponse.json({ ok: true });
  }

  if (!fromPhone) {
    return NextResponse.json({ ok: true });
  }

  const db = createServerClient();

  const { data: patient } = await db
    .from("patients")
    .select("id")
    .eq("phone", fromPhone)
    .single();

  if (!patient) {
    // Unknown number — Twilio already handles opt-out at carrier level
    return NextResponse.json({ ok: true });
  }

  // Set opt-out flag and log it (assessment_id nullable — no assessment context here)
  await db
    .from("patients")
    .update({ sms_opted_out: true })
    .eq("id", patient.id);

  await db.from("audit_logs").insert({
    patient_id: patient.id,
    action: "sms_opted_out",
  });

  // Move any open pending/in_progress assessments to manual_call_required
  const { data: openAssessments } = await db
    .from("assessments")
    .select("id")
    .eq("patient_id", patient.id)
    .in("status", ["pending", "in_progress"]);

  for (const assessment of openAssessments ?? []) {
    await db
      .from("assessments")
      .update({ status: "manual_call_required" })
      .eq("id", assessment.id);
    await db.from("audit_logs").insert({
      patient_id: patient.id,
      assessment_id: assessment.id,
      action: "manual_call_flagged",
    });
  }

  return NextResponse.json({ ok: true });
}
