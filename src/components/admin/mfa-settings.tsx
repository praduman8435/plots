"use client";

import { AlertCircle, Check, Copy, KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { confirmMfaSetup, disableMfa, regenerateRecoveryCodes, startMfaSetup } from "@/server/actions/admin/security";

type Props = { enabled: boolean; required: boolean; recoveryLeft: number };

/** Two-step sign-in: set up with an authenticator app, recovery codes, turn off. */
export function MfaSettings({ enabled, required, recoveryLeft }: Props) {
  const router = useRouter();
  const codeId = useId();
  const [pending, startTransition] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "regenerate" | "disable">("idle");
  const [copied, setCopied] = useState(false);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(fn);
  };

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-2.5 rounded-xl bg-brand-50 px-3.5 py-3 text-sm text-brand-900 ring-1 ring-brand-100">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
          <p>
            <span className="font-semibold">Save these recovery codes now.</span> Each one signs you in once if you lose your phone. They won&apos;t be shown again.
          </p>
        </div>
        <ul className="tabular grid grid-cols-2 gap-2 rounded-xl bg-mist p-3 font-mono text-sm text-ink ring-1 ring-line">
          {recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={async () => {
              await navigator.clipboard?.writeText(recoveryCodes.join("\n")).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy codes"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setRecoveryCodes(null);
              router.replace("/admin");
              router.refresh();
            }}
          >
            I&apos;ve saved them
          </Button>
        </div>
      </div>
    );
  }

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{error}</p>
    </div>
  );

  const codeField = (label: string) => (
    <Field label={label} htmlFor={codeId}>
      <Input
        id={codeId}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="tabular tracking-[0.3em]"
        maxLength={6}
      />
    </Field>
  );

  if (!enabled) {
    if (!setup) {
      return (
        <div className="flex flex-col gap-4">
          {errorBox}
          <p className="text-sm text-ink-soft">
            After your password, you&apos;ll also enter a 6-digit code from an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password). A stolen password alone
            won&apos;t open the admin.
          </p>
          <Button
            type="button"
            className="self-start"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await startMfaSetup();
                if (r.ok) setSetup({ secret: r.secret, uri: r.uri });
                else setError(r.message);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Smartphone />} Set up two-step sign-in
          </Button>
        </div>
      );
    }
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const r = await confirmMfaSetup({ code });
            if (r.ok) setRecoveryCodes(r.recoveryCodes);
            else setError(r.message);
            setCode("");
          });
        }}
      >
        {errorBox}
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-soft">
          <li>
            On this phone,{" "}
            <a href={setup.uri} className="font-semibold text-brand-700 underline underline-offset-2">
              open in your authenticator app
            </a>
            . On another device, add an account manually with this key:
          </li>
        </ol>
        <p className="tabular rounded-xl bg-mist px-3 py-2.5 font-mono text-sm break-all text-ink ring-1 ring-line">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
        <ol start={2} className="flex list-decimal flex-col gap-2 pl-5 text-sm text-ink-soft">
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        {codeField("6-digit code")}
        <Button type="submit" className="self-start" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Turn on
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {errorBox}
      <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
        <ShieldCheck className="size-4 text-brand-600" aria-hidden /> Two-step sign-in is on. {recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left.
      </p>
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode("regenerate")}>
            <KeyRound /> New recovery codes
          </Button>
          {!required && (
            <Button type="button" variant="danger" size="sm" onClick={() => setMode("disable")}>
              Turn off
            </Button>
          )}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (mode === "regenerate") {
                const r = await regenerateRecoveryCodes({ code });
                if (r.ok) setRecoveryCodes(r.recoveryCodes);
                else setError(r.message);
              } else {
                const r = await disableMfa({ code });
                if (r.ok) {
                  setMode("idle");
                  router.refresh();
                } else setError(r.message);
              }
              setCode("");
            });
          }}
        >
          {codeField("Current code from your app")}
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant={mode === "disable" ? "danger" : "primary"} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {mode === "disable" ? "Turn off two-step sign-in" : "Make new codes"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
