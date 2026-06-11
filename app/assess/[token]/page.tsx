import { createServerClient } from "@/lib/supabase/server";
import InvalidToken from "@/components/assess/InvalidToken";
import AssessmentFlow from "@/components/assess/AssessmentFlow";

export default async function AssessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createServerClient();

  const { data: tokenRow } = await db
    .from("assessment_tokens")
    .select("id, assessment_id, used, expires_at")
    .eq("token", token)
    .single();

  if (
    !tokenRow ||
    tokenRow.used ||
    new Date(tokenRow.expires_at) < new Date()
  ) {
    return <InvalidToken />;
  }

  const { data: assessment } = await db
    .from("assessments")
    .select("id, patient_id, status, opened_at")
    .eq("id", tokenRow.assessment_id)
    .single();

  if (!assessment) return <InvalidToken />;

  // First valid open: set opened_at, advance to in_progress, log assessment_opened.
  if (!assessment.opened_at) {
    await db
      .from("assessments")
      .update({ opened_at: new Date().toISOString(), status: "in_progress" })
      .eq("id", assessment.id);

    await db.from("audit_logs").insert({
      patient_id: assessment.patient_id,
      assessment_id: assessment.id,
      action: "assessment_opened",
    });
  }

  return (
    <AssessmentFlow assessmentId={assessment.id} tokenId={tokenRow.id} />
  );
}
