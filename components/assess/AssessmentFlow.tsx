"use client";

import { useState } from "react";
import Screen1Dob from "./Screen1Dob";
import Screen2Adherence from "./Screen2Adherence";
import Screen3Symptoms from "./Screen3Symptoms";
import Screen4Review from "./Screen4Review";

type Screen = 1 | 2 | 3 | 4 | "success" | "error";

type AdherenceState = {
  missed_doses: boolean | null;
  medication_changes: boolean | null;
  surgery_upcoming: boolean | null;
};

type SymptomsState = {
  pain_score: number | null;
  fever: boolean;
  infection: boolean;
  pregnancy_status: boolean;
  none_symptom: boolean;
};

type Props = {
  assessmentId: string;
  tokenId: string;
};

export default function AssessmentFlow({ assessmentId, tokenId }: Props) {
  const [screen, setScreen] = useState<Screen>(1);
  const [errorMsg, setErrorMsg] = useState("");

  const [adherence, setAdherence] = useState<AdherenceState>({
    missed_doses: null,
    medication_changes: null,
    surgery_upcoming: null,
  });

  const [symptoms, setSymptoms] = useState<SymptomsState>({
    pain_score: null,
    fever: false,
    infection: false,
    pregnancy_status: false,
    none_symptom: false,
  });

  const [refillConfirmed, setRefillConfirmed] = useState<boolean | null>(null);
  const [deliveryApproved, setDeliveryApproved] = useState<boolean | null>(null);

  if (screen === "success") {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-5xl" aria-hidden>✓</div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Assessment Submitted
          </h1>
          <p className="text-gray-600 leading-relaxed">
            Thank you. Your responses have been received. Your pharmacy team
            will review your assessment and process your refill.
          </p>
        </div>
      </main>
    );
  }

  if (screen === "error") {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold text-gray-900">
            Something went wrong
          </h1>
          <p className="text-gray-600">{errorMsg}</p>
        </div>
      </main>
    );
  }

  // All answer screens share the same card layout.
  const reviewAnswers = {
    missed_doses: adherence.missed_doses ?? false,
    medication_changes: adherence.medication_changes ?? false,
    surgery_upcoming: adherence.surgery_upcoming ?? false,
    pain_score: symptoms.pain_score ?? 0,
    fever: symptoms.fever,
    infection: symptoms.infection,
    pregnancy_status: symptoms.pregnancy_status,
    none_symptom: symptoms.none_symptom,
    refill_confirmed: refillConfirmed ?? false,
    delivery_approved: deliveryApproved ?? false,
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm px-6 py-8">
        {screen === 1 && (
          <Screen1Dob
            assessmentId={assessmentId}
            onVerified={() => setScreen(2)}
          />
        )}
        {screen === 2 && (
          <Screen2Adherence
            answers={adherence}
            onChange={setAdherence}
            onContinue={() => setScreen(3)}
          />
        )}
        {screen === 3 && (
          <Screen3Symptoms
            answers={symptoms}
            onChange={setSymptoms}
            onContinue={() => setScreen(4)}
          />
        )}
        {screen === 4 && (
          <Screen4Review
            assessmentId={assessmentId}
            tokenId={tokenId}
            answers={reviewAnswers}
            refillConfirmed={refillConfirmed}
            deliveryApproved={deliveryApproved}
            onRefillChange={setRefillConfirmed}
            onDeliveryChange={setDeliveryApproved}
            onEditAdherence={() => setScreen(2)}
            onEditSymptoms={() => setScreen(3)}
            onSubmitted={() => setScreen("success")}
            onError={(msg) => {
              setErrorMsg(msg);
              setScreen("error");
            }}
          />
        )}
      </div>
    </main>
  );
}
