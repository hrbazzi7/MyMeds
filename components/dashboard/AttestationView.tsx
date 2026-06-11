"use client";

import { useState, useTransition } from "react";
import { attestAssessment, attestAllAssessments } from "@/app/actions";
import type { AttestationRow } from "@/app/actions";

export default function AttestationView({ rows }: { rows: AttestationRow[] }) {
  const [attestedBy, setAttestedBy] = useState("");
  const [attestedIds, setAttestedIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [allResult, setAllResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = rows.filter((r) => !attestedIds.has(r.assessment_id));

  function handleAttestOne(assessmentId: string) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[assessmentId];
      return next;
    });
    startTransition(async () => {
      const res = await attestAssessment(assessmentId, attestedBy);
      if (res.ok) {
        setAttestedIds((prev) => new Set([...prev, assessmentId]));
      } else {
        setErrors((prev) => ({ ...prev, [assessmentId]: res.error ?? "Failed" }));
      }
    });
  }

  function handleAttestAll() {
    setAllResult(null);
    startTransition(async () => {
      const ids = pending.map((r) => r.assessment_id);
      const res = await attestAllAssessments(ids, attestedBy);
      if (res.ok) {
        setAttestedIds((prev) => new Set([...prev, ...ids]));
        setAllResult(`Attested ${res.attested} assessment${res.attested !== 1 ? "s" : ""}.`);
      } else {
        setAllResult(`Error: ${res.error}`);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 text-sm">
        No assessments awaiting attestation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pharmacist name + attest all */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-sm text-gray-600 mb-3">
          Daily batch sign-off: enter your name once, then attest individual rows or all at once.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Pharmacist name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={attestedBy}
              onChange={(e) => setAttestedBy(e.target.value)}
              placeholder="e.g. Dr. Jane Smith, RPh"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
            />
          </div>
          <button
            onClick={handleAttestAll}
            disabled={isPending || !attestedBy.trim() || pending.length === 0}
            className="py-2 px-5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Attesting…" : `Attest all listed (${pending.length})`}
          </button>
        </div>
        {allResult && (
          <p className={`mt-2 text-xs font-medium ${allResult.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {allResult}
          </p>
        )}
      </div>

      {/* Row list */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Patient</th>
              <th className="text-left px-4 py-3 font-medium">Medication</th>
              <th className="text-left px-4 py-3 font-medium">Outcome</th>
              <th className="text-left px-4 py-3 font-medium">Submitted</th>
              <th className="text-left px-4 py-3 font-medium">Pain</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const done = attestedIds.has(row.assessment_id);
              const err = errors[row.assessment_id];
              return (
                <tr
                  key={row.assessment_id}
                  className={`border-b border-gray-50 transition-colors ${
                    done ? "bg-green-50" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{row.patient_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.medication}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                        row.risk_outcome === "logged"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {row.risk_outcome === "logged" ? "Logged" : "Auto-approved"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {row.submitted_at
                      ? new Date(row.submitted_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {row.pain_score !== null ? row.pain_score : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {done ? (
                      <span className="text-xs text-green-600 font-medium">Attested ✓</span>
                    ) : err ? (
                      <span className="text-xs text-red-600">{err}</span>
                    ) : (
                      <button
                        onClick={() => handleAttestOne(row.assessment_id)}
                        disabled={isPending || !attestedBy.trim()}
                        className="text-xs px-3 py-1.5 bg-white border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Attest
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
