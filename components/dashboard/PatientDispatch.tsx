"use client";

import { useState, useTransition } from "react";
import { dispatchSmsToPatient, dispatchAllDueSms } from "@/app/actions";
import type { PatientRow } from "@/app/actions";

type DispatchStatus = { ok: boolean; reason?: string };

export default function PatientDispatch({ patients }: { patients: PatientRow[] }) {
  const [statuses, setStatuses] = useState<Record<string, DispatchStatus>>({});
  const [allDueResult, setAllDueResult] = useState<{
    sent: number;
    manual: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [isPendingAll, startAllTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  const sevenDayStr = sevenDays.toISOString().slice(0, 10);

  const dueSoon = patients.filter(
    (p) => p.next_refill_date >= today && p.next_refill_date <= sevenDayStr
  );
  const dueEligible = dueSoon.filter((p) => p.sms_consent && !p.sms_opted_out && !p.has_open_assessment);

  function handleSendOne(patientId: string) {
    setPendingId(patientId);
    startAllTransition(async () => {
      const res = await dispatchSmsToPatient(patientId);
      setStatuses((prev) => ({ ...prev, [patientId]: res }));
      setPendingId(null);
    });
  }

  function handleSendAll() {
    startAllTransition(async () => {
      const res = await dispatchAllDueSms();
      setAllDueResult(res);
    });
  }

  function ineligibleReason(p: PatientRow): string | null {
    if (!p.sms_consent) return "No consent";
    if (p.sms_opted_out) return "Opted out";
    if (p.has_open_assessment) return "Open assessment";
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">SMS Dispatch</h2>
        <button
          onClick={handleSendAll}
          disabled={isPendingAll || dueEligible.length === 0}
          className="py-1.5 px-3 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPendingAll ? "Sending…" : `Send all due (${dueEligible.length})`}
        </button>
      </div>

      {allDueResult && (
        <div className="mb-3 text-xs rounded border border-blue-100 bg-blue-50 p-2 space-y-0.5">
          <p className="font-medium text-blue-800">Dispatch complete</p>
          <p className="text-blue-700">Sent: {allDueResult.sent} · Manual: {allDueResult.manual} · Skipped: {allDueResult.skipped}</p>
          {allDueResult.errors.length > 0 && (
            <ul className="text-red-600">
              {allDueResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {dueSoon.length === 0 && (
          <p className="text-xs text-gray-400 py-2">No patients due within 7 days.</p>
        )}
        {dueSoon.map((p) => {
          const reason = ineligibleReason(p);
          const status = statuses[p.id];
          const isThis = pendingId === p.id;

          return (
            <div key={p.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{p.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{p.medication} · due {p.next_refill_date}</p>
              </div>
              <div className="shrink-0 text-right">
                {status ? (
                  <span
                    className={`text-xs font-medium ${
                      status.ok ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {status.ok ? "Sent ✓" : status.reason}
                  </span>
                ) : reason ? (
                  <span className="text-xs text-gray-400 italic">{reason}</span>
                ) : (
                  <button
                    onClick={() => handleSendOne(p.id)}
                    disabled={isPendingAll || isThis}
                    className="text-xs px-2 py-1 bg-white border border-blue-300 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50 transition-colors"
                  >
                    {isThis ? "…" : "Send"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
