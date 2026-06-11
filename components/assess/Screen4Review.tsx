"use client";

import { useTransition } from "react";
import type { AssessmentAnswers } from "@/app/assess/[token]/actions";
import { submitAssessment } from "@/app/assess/[token]/actions";

type FlowAnswers = AssessmentAnswers & { none_symptom: boolean };

type Props = {
  assessmentId: string;
  tokenId: string;
  answers: FlowAnswers;
  refillConfirmed: boolean | null;
  deliveryApproved: boolean | null;
  onRefillChange: (v: boolean) => void;
  onDeliveryChange: (v: boolean) => void;
  onEditAdherence: () => void;
  onEditSymptoms: () => void;
  onSubmitted: () => void;
  onError: (msg: string) => void;
};

function ReviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 text-sm font-medium text-right">{value}</span>
    </div>
  );
}

function ynLabel(v: boolean | null): string {
  if (v === null) return "—";
  return v ? "Yes" : "No";
}

function symptomList(answers: FlowAnswers): string {
  const selected: string[] = [];
  if (answers.fever) selected.push("Fever");
  if (answers.infection) selected.push("Active Infection");
  if (answers.pregnancy_status) selected.push("Pregnancy");
  if (selected.length === 0 || answers.none_symptom) return "None";
  return selected.join(", ");
}

function YesNoGroup({
  label,
  value,
  onSelect,
}: {
  label: string;
  value: boolean | null;
  onSelect: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-base font-medium text-gray-800 leading-snug">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {([true, false] as const).map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onSelect(opt)}
            aria-pressed={value === opt}
            className={[
              "min-h-[56px] rounded-xl text-lg font-semibold transition-colors",
              value === opt
                ? opt
                  ? "bg-amber-500 text-white"
                  : "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300",
            ].join(" ")}
          >
            {opt ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Screen4Review({
  assessmentId,
  tokenId,
  answers,
  refillConfirmed,
  deliveryApproved,
  onRefillChange,
  onDeliveryChange,
  onEditAdherence,
  onEditSymptoms,
  onSubmitted,
  onError,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const canSubmit =
    refillConfirmed !== null && deliveryApproved !== null;

  function handleSubmit() {
    if (!canSubmit) return;

    startTransition(async () => {
      const result = await submitAssessment(assessmentId, tokenId, {
        missed_doses: answers.missed_doses,
        medication_changes: answers.medication_changes,
        surgery_upcoming: answers.surgery_upcoming,
        pain_score: answers.pain_score,
        fever: answers.fever,
        infection: answers.infection,
        pregnancy_status: answers.pregnancy_status,
        refill_confirmed: refillConfirmed!,
        delivery_approved: deliveryApproved!,
      });

      if (result.ok) {
        onSubmitted();
      } else {
        onError(result.error ?? "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Review & Submit</h1>
        <p className="mt-1 text-gray-500 text-sm">Step 3 of 3</p>
      </div>

      {/* Adherence review */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Adherence
          </h2>
          <button
            type="button"
            onClick={onEditAdherence}
            className="text-blue-600 text-sm font-medium min-h-[44px] px-2 -mr-2"
          >
            Edit
          </button>
        </div>
        <ReviewRow label="Missed doses" value={ynLabel(answers.missed_doses)} />
        <ReviewRow label="New medications" value={ynLabel(answers.medication_changes)} />
        <ReviewRow label="Upcoming surgery" value={ynLabel(answers.surgery_upcoming)} />
      </div>

      {/* Symptoms review */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Symptoms
          </h2>
          <button
            type="button"
            onClick={onEditSymptoms}
            className="text-blue-600 text-sm font-medium min-h-[44px] px-2 -mr-2"
          >
            Edit
          </button>
        </div>
        <ReviewRow
          label="Pain level"
          value={answers.pain_score !== null ? String(answers.pain_score) + " / 10" : "—"}
        />
        <ReviewRow label="Symptoms" value={symptomList(answers)} />
      </div>

      {/* Refill confirmation questions */}
      <div className="space-y-6 pt-2">
        <YesNoGroup
          label="Are you ready for your refill to be shipped?"
          value={refillConfirmed}
          onSelect={onRefillChange}
        />
        <YesNoGroup
          label="Is your delivery address on file still correct?"
          value={deliveryApproved}
          onSelect={onDeliveryChange}
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit || isPending}
        className="w-full min-h-[56px] rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
      >
        {isPending ? "Submitting…" : "Submit Assessment"}
      </button>
    </div>
  );
}
