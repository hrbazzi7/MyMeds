"use client";

import { useState } from "react";
import type { AssessmentRow } from "@/app/actions";
import type { AssessmentStatus, RiskOutcome, RefillDisposition } from "@/types/index";

type Filter =
  | "all"
  | "pending"
  | "completed"
  | "needs_review"
  | "clinical_hold"
  | "flagged"
  | "awaiting_attestation";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<AssessmentStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  needs_review: "Needs Review",
  completed: "Completed",
  manual_call_required: "Manual Call",
};

const STATUS_COLORS: Record<AssessmentStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  needs_review: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  manual_call_required: "bg-orange-100 text-orange-700",
};

const OUTCOME_LABELS: Record<RiskOutcome, string> = {
  auto_approved: "Auto-approved",
  logged: "Logged",
  flagged: "Flagged",
  clinical_hold: "Clinical Hold",
};

const OUTCOME_COLORS: Record<RiskOutcome, string> = {
  auto_approved: "bg-green-100 text-green-700",
  logged: "bg-blue-100 text-blue-700",
  flagged: "bg-amber-100 text-amber-700",
  clinical_hold: "bg-red-100 text-red-700",
};

const DISPOSITION_LABELS: Record<RefillDisposition, string> = {
  approved: "Approved",
  pending_review: "Pending Review",
  held: "Held",
  declined_by_patient: "Declined",
};

const DISPOSITION_COLORS: Record<RefillDisposition, string> = {
  approved: "text-green-700",
  pending_review: "text-amber-700",
  held: "text-red-700",
  declined_by_patient: "text-gray-600",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${className}`}>
      {label}
    </span>
  );
}

function applyFilter(rows: AssessmentRow[], filter: Filter): AssessmentRow[] {
  switch (filter) {
    case "all":
      return rows;
    case "pending":
      return rows.filter((r) => r.status === "pending");
    case "completed":
      return rows.filter((r) => r.status === "completed");
    case "needs_review":
      return rows.filter((r) => r.status === "needs_review");
    case "clinical_hold":
      return rows.filter((r) => r.risk_outcome === "clinical_hold");
    case "flagged":
      return rows.filter((r) => r.risk_outcome === "flagged");
    case "awaiting_attestation":
      return rows.filter(
        (r) =>
          r.status === "completed" &&
          (r.risk_outcome === "auto_approved" || r.risk_outcome === "logged") &&
          r.attested_by === null
      );
    default:
      return rows;
  }
}

export default function AssessmentTable({ assessments }: { assessments: AssessmentRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  const counts: Record<Filter, number> = {
    all: assessments.length,
    pending: assessments.filter((r) => r.status === "pending").length,
    completed: assessments.filter((r) => r.status === "completed").length,
    needs_review: assessments.filter((r) => r.status === "needs_review").length,
    clinical_hold: assessments.filter((r) => r.risk_outcome === "clinical_hold").length,
    flagged: assessments.filter((r) => r.risk_outcome === "flagged").length,
    awaiting_attestation: assessments.filter(
      (r) =>
        r.status === "completed" &&
        (r.risk_outcome === "auto_approved" || r.risk_outcome === "logged") &&
        r.attested_by === null
    ).length,
  };

  const filterLabels: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Completed" },
    { key: "needs_review", label: "Needs Review" },
    { key: "clinical_hold", label: "Clinical Hold" },
    { key: "flagged", label: "Flagged" },
    { key: "awaiting_attestation", label: "Awaiting Attestation" },
  ];

  const filtered = applyFilter(assessments, filter);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilter(f: Filter) {
    setFilter(f);
    setPage(1);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1 p-3 border-b border-gray-100">
        {filterLabels.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => changeFilter(key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
            {counts[key] > 0 && (
              <span className={`ml-1 ${filter === key ? "text-blue-100" : "text-gray-400"}`}>
                ({counts[key]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Patient</th>
              <th className="text-left px-4 py-3 font-medium">Medication</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Risk Outcome</th>
              <th className="text-left px-4 py-3 font-medium">Refill Disposition</th>
              <th className="text-left px-4 py-3 font-medium">Escalation Reason</th>
              <th className="text-left px-4 py-3 font-medium">Submission Date</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No assessments found.
                </td>
              </tr>
            )}
            {paged.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{row.patient_name}</td>
                <td className="px-4 py-3 text-gray-600">{row.medication}</td>
                <td className="px-4 py-3">
                  <Badge
                    label={STATUS_LABELS[row.status]}
                    className={STATUS_COLORS[row.status]}
                  />
                </td>
                <td className="px-4 py-3">
                  {row.risk_outcome ? (
                    <Badge
                      label={OUTCOME_LABELS[row.risk_outcome]}
                      className={OUTCOME_COLORS[row.risk_outcome]}
                    />
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.refill_disposition ? (
                    <span className={`font-medium ${DISPOSITION_COLORS[row.refill_disposition]}`}>
                      {DISPOSITION_LABELS[row.refill_disposition]}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">
                  {row.escalation_reason ? (
                    <span className="text-amber-700 text-xs">{row.escalation_reason}</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {row.submitted_at
                    ? new Date(row.submitted_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : <span className="text-gray-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              ‹ Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100 transition-colors"
            >
              Next ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
