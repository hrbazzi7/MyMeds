/**
 * Creates one test patient + assessment + token and prints the /assess/ URL.
 * Run: npx tsx scripts/setup-test-token.ts
 * Cleanup: npx tsx scripts/setup-test-token.ts --cleanup
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
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

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !KEY) { console.error("Missing env vars"); process.exit(1); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = createClient<any>(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const SENTINEL = "__test_token_setup__";

async function cleanup() {
  const { error } = await db.from("patients").delete().eq("full_name", SENTINEL);
  if (!error) console.log("Cleaned up test patient and cascaded rows.");
  else console.error("Cleanup error:", error.message);
}

async function setup() {
  // Remove any stale data first
  await db.from("patients").delete().eq("full_name", SENTINEL);

  const { data: patient, error: pErr } = await db
    .from("patients")
    .insert({
      full_name: SENTINEL,
      dob: "1975-03-22",
      phone: "+15550000099",
      medication: "Enbrel",
      disease_state: "Rheumatoid Arthritis",
      next_refill_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      sms_consent: true,
    })
    .select("id")
    .single();

  if (pErr || !patient) { console.error("Patient insert failed:", pErr?.message); process.exit(1); }

  const { data: assessment, error: aErr } = await db
    .from("assessments")
    .insert({ patient_id: patient.id, status: "pending" })
    .select("id")
    .single();

  if (aErr || !assessment) { console.error("Assessment insert failed:", aErr?.message); process.exit(1); }

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();

  const { error: tErr } = await db
    .from("assessment_tokens")
    .insert({ assessment_id: assessment.id, token, expires_at: expiresAt });

  if (tErr) { console.error("Token insert failed:", tErr?.message); process.exit(1); }

  console.log("\n✓ Test data created");
  console.log("  Patient DOB : 1975-03-22  (use this to pass the DOB screen)");
  console.log("  Wrong DOB   : 1980-01-01  (use this to test failure)");
  console.log("\n  URL:");
  console.log(`  http://localhost:3000/assess/${token}\n`);
}

const isCleanup = process.argv.includes("--cleanup");
(isCleanup ? cleanup() : setup()).catch((e) => { console.error(e); process.exit(1); });
