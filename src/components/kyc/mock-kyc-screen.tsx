"use client";

import { AlertTriangle, Fingerprint, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { mockKycCancel, mockKycComplete } from "@/server/actions/kyc-mock";

/**
 * Stand-in for the KYC provider's hosted page until a real provider is
 * connected. Only the last 4 digits are kept; the number is never stored or sent.
 */
export function MockKycScreen({ attemptId, returnUrl, sellerName }: { attemptId: string; returnUrl: string; sellerName: string }) {
  const [step, setStep] = useState<"aadhaar" | "otp">("aadhaar");
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const digits = aadhaar.replace(/\D/g, "");
  const OTP = "123456";

  return (
    <div className="min-h-dvh bg-mist">
      <header className="flex items-center gap-2 bg-brand-800 px-4 py-3.5 text-white">
        <Fingerprint className="size-5" aria-hidden />
        <span className="font-bold">Aadhaar verification</span>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-card ring-1 ring-line">
          <h1 className="text-xl font-bold text-ink">Verify your identity</h1>
          <p className="mt-1 text-sm text-muted">
            Verifying <strong>{sellerName}</strong>. Plots only receives “verified” and the last 4 digits — never your full Aadhaar number.
          </p>

          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
          )}

          {step === "aadhaar" ? (
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!/^[2-9]\d{11}$/.test(digits)) return setError("Enter your 12-digit Aadhaar number.");
                setError(null);
                setStep("otp");
              }}
            >
              <Field label="Aadhaar number" htmlFor="aadhaar">
                <Input
                  id="aadhaar"
                  inputMode="numeric"
                  autoComplete="off"
                  value={aadhaar}
                  onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, "").slice(0, 12).replace(/(\d{4})(?=\d)/g, "$1 "))}
                  placeholder="XXXX XXXX XXXX"
                  className="font-mono tracking-widest"
                />
              </Field>
              <Button type="submit" size="lg" className="w-full">
                Send OTP
              </Button>
            </form>
          ) : (
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  const r = await mockKycComplete({ attemptId, aadhaar: digits, otp });
                  if (r.ok) window.location.href = returnUrl;
                  else setError(r.message ?? "Verification failed");
                });
              }}
            >
              <p className="text-sm text-muted">OTP sent for Aadhaar XXXX XXXX {digits.slice(-4)}.</p>
              <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Your OTP is{" "}
                <button type="button" onClick={() => setOtp(OTP)} className="font-mono text-base font-bold underline decoration-dotted">
                  {OTP}
                </button>{" "}
                <span className="text-amber-800/80">(tap to fill)</span>
              </p>
              <Field label="OTP" htmlFor="otp">
                <Input id="otp" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="text-center font-mono text-2xl tracking-[0.4em]" />
              </Field>
              <Button type="submit" size="lg" disabled={pending || otp.length !== 6} className="w-full">
                {pending ? "Verifying…" : "Verify"}
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() =>
              start(async () => {
                await mockKycCancel(attemptId);
                window.location.href = returnUrl;
              })
            }
            className="mt-4 w-full py-2 text-sm font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-faint">
            <Lock className="size-3.5" aria-hidden /> Your Aadhaar number is never stored
          </p>
        </div>
      </main>
    </div>
  );
}
