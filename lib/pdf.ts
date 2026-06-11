// Client-side only — import from 'use client' components only.
import { jsPDF } from "jspdf";
import type { PdfData } from "@/types/index";

const PAGE_W = 215.9; // letter width mm
const PAGE_H = 279.4; // letter height mm
const ML = 20; // left margin
const MR = 20; // right margin
const MT = 22; // top margin
const MB = 20; // bottom margin
const CW = PAGE_W - ML - MR; // content width 175.9 mm
const LH = 6.5; // body line height mm
const LW = 68; // label column width mm

function yn(val: boolean | null): string {
  if (val === null) return "Not recorded";
  return val ? "Yes" : "No";
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function fmtOutcome(v: string | null): string {
  const m: Record<string, string> = {
    auto_approved: "Auto-Approved",
    logged: "Logged (Moderate Pain, No Red Flags)",
    flagged: "Flagged — Requires Pharmacist Review",
    clinical_hold: "Clinical Hold — Refill Blocked",
  };
  return v ? (m[v] ?? v) : "—";
}

function fmtDisp(v: string | null): string {
  const m: Record<string, string> = {
    approved: "Approved",
    pending_review: "Pending Review",
    held: "Held",
    declined_by_patient: "Declined by Patient",
  };
  return v ? (m[v] ?? v) : "—";
}

export function generateAssessmentPdf(data: PdfData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  let y = MT;

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - MB) {
      doc.addPage();
      y = MT;
    }
  }

  function sectionHeader(text: string) {
    ensureSpace(16);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 80, 160);
    doc.text(text.toUpperCase(), ML, y);
    y += 1.5;
    doc.setDrawColor(40, 80, 160);
    doc.setLineWidth(0.25);
    doc.line(ML, y, PAGE_W - MR, y);
    y += LH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
  }

  function dataRow(label: string, value: string) {
    const lines = doc.splitTextToSize(value || "—", CW - LW);
    ensureSpace(LH * Math.max(1, lines.length) + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label, ML, y);
    doc.setFont("helvetica", "normal");
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i] as string, ML + LW, y + i * LH);
    }
    y += LH * Math.max(1, lines.length);
  }

  function bodyText(text: string, italic = false) {
    const lines = doc.splitTextToSize(text, CW);
    ensureSpace(LH * lines.length + 3);
    doc.setFont("helvetica", italic ? "italic" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    for (let i = 0; i < lines.length; i++) {
      doc.text(lines[i] as string, ML, y + i * LH);
    }
    y += LH * lines.length + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
  }

  // ── Title block ──────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  const titleLines = doc.splitTextToSize(
    "MyMeds Automated Clinical Assessment Report",
    CW
  );
  for (let i = 0; i < titleLines.length; i++) {
    doc.text(titleLines[i] as string, ML, y + i * 7);
  }
  y += 7 * titleLines.length + 1;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(ML, y, PAGE_W - MR, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Report generated: ${new Date().toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`,
    ML,
    y
  );
  y += 8;
  doc.setTextColor(0, 0, 0);

  // ── Patient Information ──────────────────────────────────────────────────────
  sectionHeader("Patient Information");
  dataRow("Patient Name:", data.full_name);
  dataRow("Date of Birth:", data.dob);
  dataRow("Medication:", data.medication);

  // ── Assessment Data ──────────────────────────────────────────────────────────
  sectionHeader("Assessment Data");
  dataRow("Missed Doses:", `${yn(data.missed_doses)} (patient-reported)`);
  dataRow("Medication Changes:", yn(data.medication_changes));
  dataRow("Hospitalization / ER:", yn(data.hospitalized));
  dataRow("Recent Vaccination:", yn(data.recent_vaccination));
  dataRow("Upcoming Surgery:", yn(data.surgery_upcoming));
  dataRow(
    "Pain Score:",
    data.pain_score !== null ? `${data.pain_score} / 10` : "Not recorded"
  );

  const symptoms: string[] = [];
  if (data.fever) symptoms.push("Fever");
  if (data.infection) symptoms.push("Active Infection");
  if (data.pregnancy_status) symptoms.push("Pregnancy");
  dataRow("Symptoms:", symptoms.length > 0 ? symptoms.join(", ") : "None reported");

  dataRow("Refill Confirmation:", yn(data.refill_confirmed));
  dataRow("Delivery Address:", `${yn(data.delivery_approved)} — confirmed on file`);

  // ── Self-Reported Adherence ──────────────────────────────────────────────────
  sectionHeader("Self-Reported Adherence (Patient-Reported)");
  dataRow("Missed Doses:", `${yn(data.missed_doses)} — patient self-report`);
  bodyText(
    "All adherence data above is patient self-reported via the SMS assessment workflow. " +
      "No PDC (Proportion of Days Covered) calculation is performed. " +
      "This system records patient self-report only."
  );

  // ── System Data ──────────────────────────────────────────────────────────────
  sectionHeader("System Data");
  dataRow("Risk Outcome:", fmtOutcome(data.risk_outcome));
  dataRow("Refill Disposition:", fmtDisp(data.refill_disposition));
  dataRow("Submission Time:", fmtTs(data.submitted_at));
  dataRow("Assessment ID:", data.assessment_id);

  // ── Clinical Note (logged risk outcome only) ─────────────────────────────────
  if (data.risk_outcome === "logged") {
    sectionHeader("Clinical Note");
    bodyText(
      `Moderate pain reported (score ${data.pain_score ?? "?"}/10); no clinical red flags identified. ` +
        "Refill auto-approved per protocol."
    );
  }

  // ── Clinician Oversight ──────────────────────────────────────────────────────
  sectionHeader("Clinician Oversight");
  const isAlertCase =
    data.risk_outcome === "flagged" || data.risk_outcome === "clinical_hold";

  if (isAlertCase) {
    if (data.reviewed_by && data.reviewed_at) {
      dataRow("Reviewed by:", data.reviewed_by);
      dataRow("Reviewed on:", fmtTs(data.reviewed_at));
      if (data.escalation_reason) dataRow("Alert reason:", data.escalation_reason);
      if (data.pharmacist_notes) dataRow("Pharmacist notes:", data.pharmacist_notes);
    } else {
      bodyText("Pending clinical review.", true);
    }
  } else {
    if (data.attested_by && data.attested_at) {
      dataRow("Attested by:", data.attested_by);
      dataRow("Attested on:", fmtTs(data.attested_at));
    } else {
      bodyText("Pending attestation.", true);
    }
  }

  // ── Wet-ink signature block ──────────────────────────────────────────────────
  ensureSpace(30);
  y += 5;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(ML, y, PAGE_W - MR, y);
  y += 10;
  doc.setLineWidth(0.4);
  doc.setDrawColor(0, 0, 0);
  doc.line(ML, y, ML + 105, y); // signature line
  doc.line(ML + 120, y, PAGE_W - MR, y); // date line
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Signature", ML, y);
  doc.text("Date", ML + 120, y);

  // ── Save ─────────────────────────────────────────────────────────────────────
  const safeName = data.full_name
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 30);
  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`${safeName}_assessment_${dateStr}.pdf`);
}
