"use client";

import { useState, useTransition } from "react";
import { verifyDob } from "@/app/assess/[token]/actions";

type Props = {
  assessmentId: string;
  onVerified: () => void;
};

export default function Screen1Dob({ assessmentId, onVerified }: Props) {
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dob || locked) return;

    startTransition(async () => {
      const result = await verifyDob(assessmentId, dob);
      if (result.ok) {
        onVerified();
      } else {
        setError(result.message);
        if (result.locked) setLocked(true);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Verify Your Identity
        </h1>
        <p className="mt-2 text-gray-600">
          Please enter your date of birth to begin your monthly review.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="dob"
            className="block text-base font-medium text-gray-700"
          >
            Date of Birth
          </label>
          <input
            id="dob"
            type="date"
            value={dob}
            onChange={(e) => {
              setDob(e.target.value);
              setError("");
            }}
            disabled={locked || isPending}
            required
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-lg text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
        </div>

        {error && (
          <p role="alert" className="text-red-600 text-sm leading-snug">
            {error}
          </p>
        )}

        {!locked && (
          <button
            type="submit"
            disabled={!dob || isPending}
            className="w-full min-h-[52px] rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
          >
            {isPending ? "Verifying…" : "Verify & Continue"}
          </button>
        )}
      </form>
    </div>
  );
}
