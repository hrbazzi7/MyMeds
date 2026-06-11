"use client";

type AdherenceAnswers = {
  missed_doses: boolean | null;
  medication_changes: boolean | null;
  surgery_upcoming: boolean | null;
};

type Props = {
  answers: AdherenceAnswers;
  onChange: (updated: AdherenceAnswers) => void;
  onContinue: () => void;
};

type YesNoKey = keyof AdherenceAnswers;

const QUESTIONS: { key: YesNoKey; label: string }[] = [
  {
    key: "missed_doses",
    label: "Have you missed any doses of your medication since your last refill?",
  },
  {
    key: "medication_changes",
    label: "Have you started any new medications or supplements?",
  },
  {
    key: "surgery_upcoming",
    label: "Do you have any upcoming surgery or medical procedure?",
  },
];

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
      <p className="text-base font-medium text-gray-800 leading-snug">
        {label}
      </p>
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

export default function Screen2Adherence({
  answers,
  onChange,
  onContinue,
}: Props) {
  const allAnswered = QUESTIONS.every((q) => answers[q.key] !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Adherence & Changes
        </h1>
        <p className="mt-1 text-gray-500 text-sm">Step 1 of 3</p>
      </div>

      <div className="space-y-8">
        {QUESTIONS.map((q) => (
          <YesNoGroup
            key={q.key}
            label={q.label}
            value={answers[q.key]}
            onSelect={(v) => onChange({ ...answers, [q.key]: v })}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!allAnswered}
        className="w-full min-h-[52px] rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
