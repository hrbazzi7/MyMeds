"use client";

import { useState, useTransition } from "react";
import { resolveAlert } from "@/app/actions";
import type { EscalationRow } from "@/app/actions";

export default function EscalationQueue({ rows }: { rows: EscalationRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 text-sm">
        No unresolved alerts. All exception cases have been reviewed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {rows.length} unresolved alert{rows.length !== 1 ? "s" : ""} — holds listed first.
      </p>
      {rows.map((row) => (
        <AlertCard key={row.alert_id} row={row} />
      ))}
    </div>
  );
}

function AlertCard({ row }: { row: EscalationRow }) {
  const [notes, setNotes] = useState(row.pharmacist_notes ?? "");
  const [reviewedBy, setReviewedBy] = useState(row.reviewed_by ?? "");
  const [disposition, setDisposition] = useState<"approved" | "held">(
    row.current_disposition === "held" ? "held" : "approved"
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      const res = await resolveAlert(
        row.alert_id,
        row.assessment_id,
        disposition,
        notes,
        reviewedBy
      );
      if (!res.ok) setError(res.error ?? "Failed to resolve");
    });
  }

  const isHold = row.severity === "hold";

  return (
    <div
      className={`bg-white rounded-lg border-l-4 border border-gray-200 p-5 ${
        isHold ? "border-l-red-500" : "border-l-amber-400"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-block px-2 py-0.5 text-xs font-bold rounded-full uppercase tracking-wide ${
                isHold
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {isHold ? "Hold" : "Flag"}
            </span>
            <span className="text-sm font-semibold text-gray-900">{row.patient_name}</span>
            <span className="text-sm text-gray-500">·</span>
            <span className="text-sm text-gray-600">{row.medication}</span>
          </div>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Reason:</span>{" "}
            <span className={isHold ? "text-red-700" : "text-amber-700"}>
              {row.escalation_reason}
            </span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Created {new Date(row.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {row.current_disposition && (
              <> · Current disposition: <span className="font-medium">{row.current_disposition}</span></>
            )}
          </p>
        </div>
      </div>

      {/* Pharmacist input */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Pharmacist notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Clinical notes (optional)"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Reviewed by <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            placeholder="Pharmacist name"
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
          />
        </div>
      </div>

      {/* Disposition choice + resolve */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-gray-600">Refill disposition:</span>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="radio"
            name={`disposition-${row.alert_id}`}
            value="approved"
            checked={disposition === "approved"}
            onChange={() => setDisposition("approved")}
            className="text-green-600"
          />
          <span className="text-green-700 font-medium">Approve refill</span>
        </label>
        <label className="flex items-center gap-1.5 text-sm cursor-pointer">
          <input
            type="radio"
            name={`disposition-${row.alert_id}`}
            value="held"
            checked={disposition === "held"}
            onChange={() => setDisposition("held")}
            className="text-red-600"
          />
          <span className="text-red-700 font-medium">Keep held</span>
        </label>

        <button
          onClick={handleResolve}
          disabled={isPending || !reviewedBy.trim()}
          className="ml-auto py-1.5 px-4 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Resolving…" : "Mark Resolved"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
