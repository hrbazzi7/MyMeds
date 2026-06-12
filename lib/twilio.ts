import twilio from "twilio";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Send an outbound SMS. No PHI in the body — callers are responsible for
// using first name only and never including medication or disease state.
export async function sendSms(to: string, body: string): Promise<void> {
  const client = twilio(requireEnv("TWILIO_SID"), requireEnv("TWILIO_TOKEN"));
  await client.messages.create({
    to,
    from: requireEnv("TWILIO_PHONE"),
    body,
  });
}

// Validate an inbound Twilio webhook request signature.
// Used in /api/twilio/status (Phase 5).
// Returns false (→ 403) when TWILIO_TOKEN is not configured rather than throwing.
export function validateWebhookSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  const authToken = process.env.TWILIO_TOKEN;
  if (!authToken) return false;
  return twilio.validateRequest(authToken, signature, url, params);
}
