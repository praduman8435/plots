"use client";

import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { mockKycCancel, mockKycComplete } from "@/server/actions/kyc-mock";

/** Looks and behaves like a hosted DigiLocker consent flow — for local testing only. */
export function MockKycScreen({ attemptId, returnUrl, sellerName }: { attemptId: string; returnUrl: string; sellerName: string }) {
  const [step, setStep] = useState<"aadhaar" | "otp">("aadhaar");
  const [aadhaar, setAadhaar] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const digits = aadhaar.replace(/\D/g, "");

  return (
    <div className="min-h-dvh bg-[#f3f5f9]">
      <div className="bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-900">
        SIMULATED verification screen (demo) — nothing is sent to UIDAI. Use the sample number below.
      </div>
      <header className="flex items-center gap-2 bg-[#1b3a6b] px-4 py-3 text-white">
        <ShieldCheck className="size-5" aria-hidden />
        <span className="font-bold">DigiLocker</span>
        <span className="text-xs text-white/70">· Identity check (mock)</span>
      </header>
      <main className="mx-auto max-w-md px-4 py-8">
        <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-black/5">
          <h1 className="text-xl font-bold text-ink">Verify with Aadhaar</h1>
          <p className="mt-1 text-sm text-muted">
            <strong>Plots</strong> is requesting to verify the identity of <strong>{sellerName}</strong>. They will only receive “verified” and the last 4 digits.
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
                if (digits.length !== 12) return setError("Enter all 12 digits.");
                setError(null);
                setStep("otp");
              }}
            >
              <Field label="Aadhaar number" htmlFor="aadhaar" hint="Mock: try 2345 6789 0124">
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
              <Button type="submit" size="lg" className="w-full bg-[#1b3a6b] shadow-none hover:bg-[#15305a]">
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
              <p className="text-sm text-muted">OTP sent to the mobile linked with Aadhaar XXXX XXXX {digits.slice(-4)}.</p>
              <Field label="OTP" htmlFor="otp" hint="Mock: use 123456">
                <Input id="otp" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} className="text-center font-mono text-2xl tracking-[0.4em]" />
              </Field>
              <Button type="submit" size="lg" disabled={pending || otp.length !== 6} className="w-full bg-[#1b3a6b] shadow-none hover:bg-[#15305a]">
                {pending ? "Verifying…" : "Allow & verify"}
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
            <Lock className="size-3.5" aria-hidden /> Your Aadhaar number is not shared with Plots
          </p>
        </div>
      </main>
    </div>
  );
}
