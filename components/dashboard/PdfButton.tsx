"use client";

import { useState, useTransition } from "react";
import { fetchAssessmentForPdf } from "@/app/actions";
import { generateAssessmentPdf } from "@/lib/pdf";

export default function PdfButton({ assessmentId }: { assessmentId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await fetchAssessmentForPdf(assessmentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      try {
        generateAssessmentPdf(result.data);
      } catch {
        setError("PDF generation failed");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs px-2 py-1 text-blue-600 border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50 transition-colors whitespace-nowrap"
        title="Download PDF report"
      >
        {isPending ? "…" : "↓ PDF"}
      </button>
      {error && (
        <span className="text-xs text-red-500">{error}</span>
      )}
    </div>
  );
}
