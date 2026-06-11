import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { validateWebhookSignature } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Twilio sends application/x-www-form-urlencoded
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  // Reconstruct exact URL Twilio signed (must match what was registered as callback URL)
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/twilio/status`;

  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!validateWebhookSignature(signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const messageStatus = params["MessageStatus"] ?? "";
  const toPhone = params["To"] ?? "";

  // Only act on terminal failure statuses
  if (messageStatus !== "failed" && messageStatus !== "undelivered") {
    return NextResponse.json({ ok: true });
  }

  if (!toPhone) {
    return NextResponse.json({ error: "Missing To field" }, { status: 400 });
  }

  const db = createServerClient();

  const { data: patient } = await db
    .from("patients")
    .select("id")
    .eq("phone", toPhone)
    .single();

  if (!patient) {
    return NextResponse.json({ ok: true });
  }

  const { data: assessment } = await db
    .from("assessments")
    .select("id")
    .eq("patient_id", patient.id)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!assessment) {
    return NextResponse.json({ ok: true });
  }

  await db
    .from("assessments")
    .update({ status: "manual_call_required" })
    .eq("id", assessment.id);

  await db.from("audit_logs").insert([
    { patient_id: patient.id, assessment_id: assessment.id, action: "sms_failed" },
    { patient_id: patient.id, assessment_id: assessment.id, action: "manual_call_flagged" },
  ]);

  return NextResponse.json({ ok: true });
}
