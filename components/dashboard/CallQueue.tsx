import type { CallQueueRow } from "@/app/actions";

const REASON_COLORS: Record<string, string> = {
  "Non-responder": "bg-gray-100 text-gray-600",
  "SMS delivery failure": "bg-orange-100 text-orange-700",
  "DOB lockout": "bg-red-100 text-red-700",
  "Refill declined by patient": "bg-purple-100 text-purple-700",
  "Address change needed": "bg-blue-100 text-blue-700",
  "No SMS consent": "bg-yellow-100 text-yellow-700",
  "SMS opt-out": "bg-amber-100 text-amber-700",
};

export default function CallQueue({ rows }: { rows: CallQueueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 text-sm">
        No patients in the call queue.
      </div>
    );
  }

  // Group by reason for easier scanning
  const reasonOrder = [
    "Non-responder",
    "SMS delivery failure",
    "DOB lockout",
    "Refill declined by patient",
    "Address change needed",
    "No SMS consent",
    "SMS opt-out",
  ];

  const grouped = new Map<string, CallQueueRow[]>();
  for (const reason of reasonOrder) {
    const group = rows.filter((r) => r.call_reason === reason);
    if (group.length > 0) grouped.set(reason, group);
  }
  // Catch any unexpected reasons
  for (const row of rows) {
    if (!reasonOrder.includes(row.call_reason)) {
      const existing = grouped.get(row.call_reason) ?? [];
      grouped.set(row.call_reason, [...existing, row]);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        {rows.length} patient{rows.length !== 1 ? "s" : ""} require manual outreach.
      </p>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {[...grouped.entries()].map(([reason, group]) => (
          <span
            key={reason}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full ${
              REASON_COLORS[reason] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {reason}
            <span className="font-bold">{group.length}</span>
          </span>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Patient</th>
              <th className="text-left px-4 py-3 font-medium">Medication</th>
              <th className="text-left px-4 py-3 font-medium">Phone</th>
              <th className="text-left px-4 py-3 font-medium">Reason for Call</th>
              <th className="text-left px-4 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.assessment_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{row.patient_name}</td>
                <td className="px-4 py-3 text-gray-600">{row.medication}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{row.phone}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${
                      REASON_COLORS[row.call_reason] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {row.call_reason}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(row.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
