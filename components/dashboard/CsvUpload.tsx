"use client";

import { useRef, useState, useTransition } from "react";
import { importPatientsCsv } from "@/app/actions";

type ImportResult = {
  inserted: number;
  rejected: number;
  errors: Array<{ row: number; reason: string }>;
};

export default function CsvUpload() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await importPatientsCsv(formData);
      setResult(res);
      formRef.current?.reset();
    });
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Import Patients via CSV</h2>
      <p className="text-xs text-gray-500 mb-4">
        Required columns:{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">
          full_name, dob, phone, medication, disease_state, next_refill_date, sms_consent
        </code>
      </p>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <input
          type="file"
          name="csv"
          accept=".csv,text/csv"
          required
          className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
        />
        <button
          type="submit"
          disabled={isPending}
          className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? "Importing…" : "Upload & Import"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-4 text-sm">
            <span className="text-green-700 font-medium">
              ✓ {result.inserted} inserted
            </span>
            {result.rejected > 0 && (
              <span className="text-red-600 font-medium">
                ✗ {result.rejected} rejected
              </span>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-red-700 mb-1">Validation errors:</p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-red-700">
                    {e.row > 0 ? `Row ${e.row}: ` : ""}{e.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.inserted > 0 && result.errors.length === 0 && (
            <p className="text-xs text-green-700">All rows imported successfully.</p>
          )}
        </div>
      )}
    </div>
  );
}
