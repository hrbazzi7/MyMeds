"use client";

type SymptomsAnswers = {
  pain_score: number | null;
  fever: boolean;
  infection: boolean;
  pregnancy_status: boolean;
  none_symptom: boolean;
};

type Props = {
  answers: SymptomsAnswers;
  onChange: (updated: SymptomsAnswers) => void;
  onContinue: () => void;
};

const PAIN_SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type SymptomKey = "fever" | "infection" | "pregnancy_status" | "none_symptom";

const SYMPTOM_OPTIONS: { key: SymptomKey; label: string }[] = [
  { key: "fever", label: "Fever" },
  { key: "infection", label: "Active Infection" },
  { key: "pregnancy_status", label: "Pregnancy" },
  { key: "none_symptom", label: "None of the above" },
];

function painColor(score: number): string {
  if (score <= 3) return "bg-green-600 text-white";
  if (score <= 6) return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}

export default function Screen3Symptoms({
  answers,
  onChange,
  onContinue,
}: Props) {
  const canContinue =
    answers.pain_score !== null &&
    (answers.fever ||
      answers.infection ||
      answers.pregnancy_status ||
      answers.none_symptom);

  function toggleSymptom(key: SymptomKey) {
    if (key === "none_symptom") {
      // None clears all other symptoms.
      onChange({
        ...answers,
        fever: false,
        infection: false,
        pregnancy_status: false,
        none_symptom: !answers.none_symptom,
      });
    } else {
      // Any specific symptom deselects None.
      onChange({
        ...answers,
        [key]: !answers[key],
        none_symptom: false,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Symptoms</h1>
        <p className="mt-1 text-gray-500 text-sm">Step 2 of 3</p>
      </div>

      {/* Pain score */}
      <div className="space-y-3">
        <p className="text-base font-medium text-gray-800">
          What is your current pain level?
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          {PAIN_SCORES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...answers, pain_score: n })}
              aria-pressed={answers.pain_score === n}
              className={[
                "w-16 h-16 rounded-xl text-xl font-bold transition-colors",
                answers.pain_score === n
                  ? painColor(n)
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300",
              ].join(" ")}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 px-1">
          <span>No pain</span>
          <span>Worst pain</span>
        </div>
      </div>

      {/* Symptoms checklist */}
      <div className="space-y-3">
        <p className="text-base font-medium text-gray-800">
          Are you experiencing any of the following?
        </p>
        <p className="text-sm text-gray-500">Select all that apply.</p>
        <div className="space-y-2">
          {SYMPTOM_OPTIONS.map(({ key, label }) => {
            const checked = answers[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSymptom(key)}
                aria-pressed={checked}
                className={[
                  "w-full min-h-[52px] px-5 py-3 rounded-xl text-left text-base font-medium flex items-center gap-3 transition-colors",
                  checked
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center",
                    checked ? "border-white bg-white" : "border-gray-400",
                  ].join(" ")}
                  aria-hidden
                >
                  {checked && (
                    <svg
                      viewBox="0 0 12 12"
                      className="w-3 h-3 text-blue-600"
                      fill="currentColor"
                    >
                      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full min-h-[52px] rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
