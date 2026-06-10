/**
 * MyMeds Phase 2 DB verification script — idempotent.
 * Run: npx tsx scripts/verify-db.ts
 * Requires .env.local to be populated.
 *
 * Idempotency guarantee: begins by deleting any stale __verify_test__ rows from
 * prior interrupted runs, so it is safe to re-run without manual cleanup.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (tsx does not auto-load it)
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

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
  console.error("Missing env vars. Ensure .env.local is populated.");
  process.exit(1);
}

const svc  = createClient<Database>(SUPABASE_URL, SERVICE_KEY,  { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient<Database>(SUPABASE_URL, ANON_KEY,     { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
let failed = 0;

function ok(label: string, result: boolean, detail = "") {
  if (result) { console.log(`  ✓  ${label}`); passed++; }
  else        { console.error(`  ✗  ${label}${detail ? " — " + detail : ""}`); failed++; }
}

async function run() {

  // ── 0. Pre-run cleanup — remove any stale test rows from a previous interrupted run
  await svc.from("patients").delete().eq("full_name", "__verify_test__");

  console.log("\n── 1. Service-role SELECT on all 5 tables ──────────────────────────");
  const tables = ["patients", "assessments", "alerts", "assessment_tokens", "audit_logs"] as const;
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (svc.from(t as any) as any).select("*").limit(0);
    ok(`svc can query ${t}`, error === null, error?.message ?? "");
  }

  console.log("\n── 2. Service-role INSERT + SELECT ─────────────────────────────────");
  const { data: inserted, error: insErr } = await svc
    .from("patients")
    .insert({
      full_name:       "__verify_test__",
      dob:             "1990-06-15",
      phone:           "+15550000001",
      medication:      "Enbrel",
      disease_state:   "Rheumatoid Arthritis",
      next_refill_date: "2026-07-10",
    })
    .select("id, full_name")
    .single();

  ok("svc INSERT patient",     insErr === null,           insErr?.message ?? "");
  const patientId = inserted?.id ?? "";
  ok("row has valid UUID id",  patientId.length === 36,   patientId);

  const { data: fetched, error: fetchErr } = await svc
    .from("patients")
    .select("id, full_name")
    .eq("id", patientId)
    .single();
  ok("svc SELECT returns inserted row",
    fetchErr === null && fetched?.full_name === "__verify_test__",
    fetchErr?.message ?? "");

  console.log("\n── 3. Anon-key RLS denial ───────────────────────────────────────────");
  const { data: anonRows, error: anonSelErr } = await anon
    .from("patients")
    .select("id")
    .limit(10);
  // deny-all USING(false) → PostgREST returns 0 rows, no error
  ok("anon SELECT → 0 rows (RLS blocks visibility)",
    anonSelErr === null && (anonRows?.length ?? 0) === 0,
    `rows=${anonRows?.length ?? "?"} err=${anonSelErr?.message ?? "none"}`);

  const { error: anonInsErr } = await anon
    .from("patients")
    .insert({ full_name: "__anon_attack__", dob: "1990-01-01", phone: "+10000000000",
              medication: "x", disease_state: "x", next_refill_date: "2026-01-01" });
  ok("anon INSERT → rejected by RLS", anonInsErr !== null,
    anonInsErr ? "" : "Expected a policy violation error, got none");

  console.log("\n── 4. Enum values ───────────────────────────────────────────────────");

  if (!patientId) {
    console.error("  ✗  Skipping enum checks — no patientId (INSERT failed above)");
    failed++;
  } else {
    // assessment_status — all 5 values
    const statuses = ["pending","in_progress","needs_review","completed","manual_call_required"] as const;
    for (const status of statuses) {
      const { error: e } = await svc
        .from("assessments")
        .insert({ patient_id: patientId, status })
        .select("id").single();
      ok(`assessment_status '${status}' accepted`, e === null, e?.message ?? "");
    }
    await svc.from("assessments").delete().eq("patient_id", patientId);

    // risk_outcome + refill_disposition
    const { data: ass, error: assErr } = await svc
      .from("assessments")
      .insert({ patient_id: patientId, status: "completed",
                risk_outcome: "auto_approved", refill_disposition: "approved" })
      .select("id").single();
    ok("risk_outcome 'auto_approved' + refill_disposition 'approved' accepted",
      assErr === null, assErr?.message ?? "");
    const assId = ass?.id ?? "";

    // alert_severity
    if (assId) {
      for (const severity of ["flag", "hold"] as const) {
        const { error: e } = await svc
          .from("alerts")
          .insert({ patient_id: patientId, assessment_id: assId,
                    severity, escalation_reason: "verify test" })
          .select("id").single();
        ok(`alert_severity '${severity}' accepted`, e === null, e?.message ?? "");
      }
    }

    // audit_action — sample of 4 representative values
    const auditSamples = ["sms_sent","dob_verified","pdf_generated","manual_call_flagged"] as const;
    for (const action of auditSamples) {
      const { error: e } = await svc
        .from("audit_logs")
        .insert({ patient_id: patientId, action });
      ok(`audit_action '${action}' accepted`, e === null, e?.message ?? "");
    }

    // Bad enum value must be rejected
    const { error: badEnumErr } = await svc
      .from("assessments")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ patient_id: patientId, status: "not_a_valid_status" as any });
    ok("invalid status value → DB rejects with enum error",
      badEnumErr !== null && (badEnumErr.message.includes("invalid input value") || badEnumErr.message.includes("22P02")),
      badEnumErr?.message ?? "no error returned");
  }

  console.log("\n── 5. Cleanup ───────────────────────────────────────────────────────");
  const { error: delErr } = await svc
    .from("patients")
    .delete()
    .eq("full_name", "__verify_test__");  // matches by name so cleanup is idempotent
  ok("all __verify_test__ rows deleted (cascade covers child tables)",
    delErr === null, delErr?.message ?? "");

  // Confirm the row is truly gone
  const { data: remaining } = await svc
    .from("patients")
    .select("id")
    .eq("full_name", "__verify_test__");
  ok("no __verify_test__ rows remain after cleanup",
    (remaining?.length ?? 0) === 0,
    `still has ${remaining?.length ?? "?"} rows`);

  const total = passed + failed;
  console.log(`\n── Result: ${passed}/${total} passed, ${failed} failed ──────────────────────────`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => { console.error(err); process.exit(1); });
