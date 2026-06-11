"use client";

import { useState } from "react";
import type { DashboardData } from "@/app/actions";
import CsvUpload from "./CsvUpload";
import AssessmentTable from "./AssessmentTable";
import PatientDispatch from "./PatientDispatch";
import EscalationQueue from "./EscalationQueue";
import AttestationView from "./AttestationView";
import CallQueue from "./CallQueue";

type Tab = "assessments" | "escalation" | "attestation" | "callqueue";

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [tab, setTab] = useState<Tab>("assessments");

  const escCount = initialData.escalation.length;
  const attestCount = initialData.attestation.length;
  const callCount = initialData.callQueue.length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "assessments", label: "Assessments" },
    { key: "escalation", label: "Escalation Queue", badge: escCount },
    { key: "attestation", label: "Attestation", badge: attestCount },
    { key: "callqueue", label: "Call Queue", badge: callCount },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">MyMeds — Staff Dashboard</h1>
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded">
            ⚠ No auth — deploy behind platform-level password protection
          </span>
        </div>
      </header>

      {/* Tab nav */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-7xl mx-auto flex gap-0">
          {tabs.map(({ key, label, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              {label}
              {badge !== undefined && badge > 0 && (
                <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {tab === "assessments" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CsvUpload />
              <PatientDispatch patients={initialData.patients} />
            </div>
            <AssessmentTable assessments={initialData.assessments} />
          </div>
        )}
        {tab === "escalation" && (
          <EscalationQueue rows={initialData.escalation} />
        )}
        {tab === "attestation" && (
          <AttestationView rows={initialData.attestation} />
        )}
        {tab === "callqueue" && (
          <CallQueue rows={initialData.callQueue} />
        )}
      </main>
    </div>
  );
}
