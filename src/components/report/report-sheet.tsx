"use client";

import { AlertCircle, CheckCircle2, Flag, Loader2, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { OTHER_DESCRIPTION_MIN, REPORT_DESCRIPTION_MAX, reasonsFor } from "@/lib/reports";
import { reportAction } from "@/server/actions/report";

type Props = {
  target: "LISTING" | "PROFILE";
  /** LISTING: plot id. PROFILE: profile slug. */
  targetRef: string;
  /** Shown above the reasons, e.g. "This property is already marked as sold." */
  notice?: string;
  /** Reasons that don't apply right now (e.g. PROPERTY_SOLD on a sold plot). */
  hideReasons?: string[];
  className?: string;
};

const SUCCESS = "Thank you for helping us keep property listings accurate. Our team will review your report.";

/** "Report this listing / profile": a quiet trigger and a bottom sheet with one reason + optional details. */
export function ReportSheet({ target, targetRef, notice, hideReasons = [], className }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const noun = target === "LISTING" ? "listing" : "profile";
  const question = target === "LISTING" ? "Why are you reporting this property?" : "Why are you reporting this seller profile?";
  const options = reasonsFor(target).filter((r) => !hideReasons.includes(r.code));
  const needsDetails = reason === "OTHER";
  const length = description.trim().length;

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
    if (done) {
      // Fresh form next time (a repeat report is recognised server-side anyway).
      setDone(false);
      setReason("");
      setDescription("");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!reason) return setError({ field: "reason", message: "Please choose a reason." });
    if (needsDetails && length < OTHER_DESCRIPTION_MIN) return setError({ field: "description", message: "Please tell us briefly what's wrong." });
    if (length > REPORT_DESCRIPTION_MAX) return setError({ field: "description", message: `Please keep it under ${REPORT_DESCRIPTION_MAX} characters.` });
    setError(null);
    startTransition(async () => {
      try {
        const r = await reportAction({ target, ref: targetRef, reason, description });
        if (r.ok) setDone(true);
        else setError({ field: r.field, message: r.message });
      } catch {
        setError({ message: "Couldn't send your report. Check your connection and try again." });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={cn("inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-muted transition hover:text-danger", className)}
      >
        <Flag className="size-4" aria-hidden /> Report this {noun}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${formId}-title`}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-3xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        onClose={() => done && close()}
      >
        <div className="pb-safe px-5 pt-3 sm:p-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <h2 id={`${formId}-title`} className="text-lg font-bold text-ink">
              {done ? "Report sent" : question}
            </h2>
            <button
              type="button"
              onClick={close}
              className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          {done ? (
            <div className="mt-3 mb-2">
              <p role="status" className="flex items-start gap-2.5 rounded-2xl bg-brand-50 px-4 py-3.5 text-sm text-brand-900 ring-1 ring-brand-100">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                {SUCCESS}
              </p>
              <Button type="button" variant="secondary" className="mt-4 w-full" onClick={close}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-3">
              {notice && <p className="mb-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-amber-100">{notice}</p>}

              <fieldset aria-describedby={error?.field === "reason" ? `${formId}-err` : undefined}>
                <legend className="sr-only">{question}</legend>
                <div className="grid gap-2">
                  {options.map((o) => {
                    const checked = reason === o.code;
                    return (
                      <label
                        key={o.code}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl px-3.5 py-3 ring-1 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
                          checked ? "bg-brand-50 ring-brand-300" : "bg-white ring-line hover:bg-mist",
                        )}
                      >
                        <input
                          type="radio"
                          name={`${formId}-reason`}
                          value={o.code}
                          checked={checked}
                          onChange={() => {
                            setReason(o.code);
                            if (error?.field === "reason") setError(null);
                          }}
                          className="mt-1 size-4 shrink-0 accent-brand-600"
                        />
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-ink">{o.label}</span>
                          <span className="block text-[13px] leading-snug text-muted">{o.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label htmlFor={`${formId}-details`} className="mt-4 block text-sm font-semibold text-ink">
                {needsDetails ? "What's wrong?" : "Anything else? (optional)"}
              </label>
              <textarea
                id={`${formId}-details`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={REPORT_DESCRIPTION_MAX}
                required={needsDetails}
                aria-invalid={error?.field === "description" || undefined}
                aria-describedby={`${formId}-count${error?.field === "description" ? ` ${formId}-err` : ""}`}
                placeholder={needsDetails ? "Tell us briefly what's wrong" : "Details that help us check (don't include personal information)"}
                className="mt-1.5 w-full resize-none rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-[16px] text-ink placeholder:text-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
              />
              <p id={`${formId}-count`} className="mt-1 text-right text-xs text-faint">
                {length}/{REPORT_DESCRIPTION_MAX}
              </p>

              {error && (
                <p id={`${formId}-err`} role="alert" className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-red-100">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {error.message}
                </p>
              )}

              <Button type="submit" size="lg" className="mt-3 w-full" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Flag />}
                {pending ? "Sending…" : "Submit report"}
              </Button>
              <p className="mt-3 mb-2 text-center text-xs text-muted">Reports are private. The seller never sees who reported.</p>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
