import { sendSms } from "./twilio";

export async function sendAssessmentSms(
  patient: {
    full_name: string;
    phone: string;
    sms_consent: boolean;
    sms_opted_out: boolean;
  },
  tokenStr: string,
  baseUrl: string
): Promise<{ sent: boolean; reason?: string }> {
  if (!patient.sms_consent || patient.sms_opted_out) {
    return { sent: false, reason: "ineligible" };
  }
  const firstName = patient.full_name.split(" ")[0];
  const link = `${baseUrl}/assess/${tokenStr}`;
  // No PHI in body — first name only, no medication, no disease state, no identifiers
  const body = `Hi ${firstName}, your monthly refill review is ready. Complete here: ${link}`;
  try {
    await sendSms(patient.phone, body);
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: String(err) };
  }
}
