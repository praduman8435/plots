"use client";

import { AlertCircle, ArrowLeft, Clock, Eye, EyeOff, KeyRound, Loader2, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { adminLogin, adminVerifyMfa } from "@/server/actions/admin/auth";

export function AdminLoginForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"password" | "code">("password");
  const [code, setCode] = useState("");
  const codeId = useId();
  const rateLimited = Boolean(error?.startsWith("Too many"));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await adminLogin({ email, password });
      if (result.ok && result.mfaRequired) {
        setPassword("");
        setStep("code");
      } else if (result.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(result.message);
        setPassword("");
      }
    });
  }

  function onSubmitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!code.trim()) return setError("Enter the 6-digit code from your authenticator app.");
    setError(null);
    startTransition(async () => {
      const result = await adminVerifyMfa({ code });
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(result.message);
        setCode("");
        if (result.message.includes("timed out")) setStep("password");
      }
    });
  }

  if (step === "code") {
    return (
      <form onSubmit={onSubmitCode} noValidate className="flex flex-col gap-5">
        {error && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        )}
        <Field label="Code from your authenticator app" htmlFor={codeId} hint="Lost your phone? Enter one of your recovery codes instead.">
          <Input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            className="tabular tracking-[0.3em]"
            maxLength={20}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {pending ? "Checking…" : "Verify and sign in"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep("password");
            setError(null);
            setCode("");
          }}
          className="-mt-2 inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden /> Use a different account
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error &&
        (rateLimited ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <Clock className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="font-semibold">Sign-in paused for 15 minutes</p>
              <p className="mt-0.5 text-amber-800">There were too many attempts. For your security, wait a little and try again — or ask your team lead to reset your password.</p>
            </div>
          </div>
        ) : (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        ))}

      <Field label="Email" htmlFor={emailId}>
        <Input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@plots.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error) || undefined}
          required
        />
      </Field>

      <Field label="Password" htmlFor={passwordId}>
        <div className="relative">
          <Input
            id={passwordId}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
            className="pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:text-ink"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
      </Field>

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
