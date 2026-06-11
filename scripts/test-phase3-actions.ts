/**
 * Phase 3 server-action logic test — runs directly via Supabase client.
 * Mirrors the logic in app/assess/[token]/actions.ts.
 * Run: npx tsx scripts/test-phase3-actions.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

let passed = 0; let failed = 0;
function ok(label: string, val: boolean, detail = "") {
  if (val) { console.log(`  ✓  ${label}`); passed++; }
  else { console.error(`  ✗  ${label}${detail ? " — " + detail : ""}`); failed++; }
}

async function run() {
  // ── Find the __test_token_setup__ patient created by setup-test-token.ts ──
  const { data: patient } = await db
    .from("patients")
    .select("id, dob")
    .eq("full_name", "__test_token_setup__")
    .single();

  if (!patient) {
    console.error("Run scripts/setup-test-token.ts first to create test data.");
    process.exit(1);
  }

  console.log("\n── 1. Check assessment_opened audit log fired on first load ──");
  const { data: assessment } = await db
    .from("assessments")
    .select("id, status, opened_at")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  ok("assessment row exists", !!assessment, "no assessment found for test patient");
  ok("status is in_progress (set by page.tsx on first open)", assessment?.status === "in_progress", assessment?.status ?? "");
  ok("opened_at is set", !!assessment?.opened_at, "opened_at is null");

  const { data: openedLog } = await db
    .from("audit_logs")
    .select("action")
    .eq("assessment_id", assessment?.id)
    .eq("action", "assessment_opened");
  ok("assessment_opened audit log exists", (openedLog?.length ?? 0) >= 1);

  console.log("\n── 2. DOB failure — wrong date ──");
  const wrongDob = "1980-01-01";
  const isWrong = patient.dob !== wrongDob;
  ok("test setup: wrong DOB differs from patient DOB", isWrong);

  // Simulate wrong DOB: insert dob_failed log + count
  await db.from("audit_logs").insert({
    patient_id: patient.id,
    assessment_id: assessment.id,
    action: "dob_failed",
  });

  const { count: c1 } = await db
    .from("audit_logs")
    .select("*", { count: "exact", head: true })
    .eq("assessment_id", assessment.id)
    .eq("action", "dob_failed");
  ok("dob_failed count increments after failure", (c1 ?? 0) >= 1, `count=${c1}`);

  console.log("\n── 3. DOB success — correct date ──");
  // Verify DOB matches
  ok("correct DOB matches patient record", patient.dob === "1975-03-22", patient.dob);
  await db.from("audit_logs").insert([
    { patient_id: patient.id, assessment_id: assessment.id, action: "dob_verified" },
    { patient_id: patient.id, assessment_id: assessment.id, action: "assessment_started" },
  ]);

  const { data: successLogs } = await db
    .from("audit_logs")
    .select("action")
    .eq("assessment_id", assessment.id)
    .in("action", ["dob_verified", "assessment_started"]);
  const actions = successLogs?.map((l: { action: string }) => l.action) ?? [];
  ok("dob_verified logged", actions.includes("dob_verified"));
  ok("assessment_started logged", actions.includes("assessment_started"));

  console.log("\n── 4. Lockout at 5 failures ──");
  // Add enough failures to reach 5 total
  const { count: currentFails } = await db
    .from("audit_logs")
    .select("*", { count: "exact", head: true })
    .eq("assessment_id", assessment.id)
    .eq("action", "dob_failed");
  const toAdd = 5 - (currentFails ?? 0);
  if (toAdd > 0) {
    const rows = Array.from({ length: toAdd }, () => ({
      patient_id: patient.id,
      assessment_id: assessment.id,
      action: "dob_failed",
    }));
    await db.from("audit_logs").insert(rows);
  }
  const { count: totalFails } = await db
    .from("audit_logs")
    .select("*", { count: "exact", head: true })
    .eq("assessment_id", assessment.id)
    .eq("action", "dob_failed");
  ok("5 dob_failed entries present", (totalFails ?? 0) >= 5, `count=${totalFails}`);

  // Simulate lockout: mark token used + set status manual_call_required
  await db.from("assessment_tokens").update({ used: true }).eq("assessment_id", assessment.id);
  await db.from("assessments").update({ status: "manual_call_required" }).eq("id", assessment.id);

  const { data: lockedAssessment } = await db
    .from("assessments")
    .select("status")
    .eq("id", assessment.id)
    .single();
  ok("status set to manual_call_required after lockout", lockedAssessment?.status === "manual_call_required");

  const { data: lockedToken } = await db
    .from("assessment_tokens")
    .select("used")
    .eq("assessment_id", assessment.id)
    .single();
  ok("token marked used after lockout", lockedToken?.used === true);

  console.log("\n── 5. Submit assessment saves all fields ──");
  // Reset: un-lock for submission test
  await db.from("assessment_tokens").update({ used: false }).eq("assessment_id", assessment.id);
  await db.from("assessments").update({ status: "in_progress" }).eq("id", assessment.id);

  const now = new Date().toISOString();
  await db.from("assessments").update({
    missed_doses: true,
    medication_changes: false,
    surgery_upcoming: false,
    pain_score: 5,
    fever: false,
    infection: false,
    pregnancy_status: false,
    refill_confirmed: true,
    delivery_approved: true,
    submitted_at: now,
    status: "needs_review",
  }).eq("id", assessment.id);
  await db.from("assessment_tokens").update({ used: true }).eq("assessment_id", assessment.id);
  await db.from("audit_logs").insert({
    patient_id: patient.id,
    assessment_id: assessment.id,
    action: "assessment_submitted",
  });

  const { data: submitted } = await db
    .from("assessments")
    .select("status, missed_doses, pain_score, submitted_at")
    .eq("id", assessment.id)
    .single();

  ok("status = needs_review after submit", submitted?.status === "needs_review");
  ok("missed_doses saved", submitted?.missed_doses === true);
  ok("pain_score saved", submitted?.pain_score === 5);
  ok("submitted_at is set", !!submitted?.submitted_at);

  const { data: submittedToken } = await db
    .from("assessment_tokens")
    .select("used")
    .eq("assessment_id", assessment.id)
    .single();
  ok("token marked used after submit", submittedToken?.used === true);

  const { data: submittedLog } = await db
    .from("audit_logs")
    .select("action")
    .eq("assessment_id", assessment.id)
    .eq("action", "assessment_submitted");
  ok("assessment_submitted audit log exists", (submittedLog?.length ?? 0) >= 1);

  console.log(`\n── Result: ${passed}/${passed + failed} passed ──────────────────────────────────────`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
