"use client";

import { BellRing, CheckCircle2, ShieldCheck, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { LandType } from "@/generated/prisma/enums";
import { BUDGETS } from "@/lib/budgets";
import { readStoredBuyer, storeBuyer } from "@/lib/buyer-storage";
import { cn } from "@/lib/cn";
import { LAND_TYPES } from "@/lib/land";
import { normalizePhoneNumber } from "@/lib/phone";

const NAME = /^[\p{L}\p{M} .'-]+$/u;
const PLACE = /^[\p{L}\p{M}\p{N} .,'()/-]+$/u;

export type BuyerRequestDefaults = { place?: string; area?: string; landType?: LandType; budgetMax?: string };

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "done"; place: string } | { kind: "error"; message: string };

/**
 * "Tell us what you need": a button that opens a short form. The buyer says
 * where, what and up to what budget; our team WhatsApps them when matching
 * land is listed. Prefilled from the search they just made.
 */
export function BuyerRequestButton({
  defaults,
  places,
  children = "Tell us what you need",
  variant = "primary",
  size = "lg",
  className,
}: {
  defaults?: BuyerRequestDefaults;
  /** Our city names, offered as suggestions in the place field. */
  places: string[];
  children?: React.ReactNode;
  variant?: "primary" | "white" | "secondary";
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(0);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setOpened((n) => n + 1); // fresh form, with the remembered name and number, each time
          dialog.current?.showModal();
        }}
      >
        <BellRing /> {children}
      </Button>
      <dialog
        ref={dialog}
        aria-label="Tell us what land you need"
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-3xl sm:open:animate-fade-up"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        {opened > 0 && <RequestForm key={opened} defaults={defaults} places={places} onClose={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

function RequestForm({ defaults, places, onClose }: { defaults?: BuyerRequestDefaults; places: string[]; onClose: () => void }) {
  const id = useId();
  const remembered = readStoredBuyer();
  const [name, setName] = useState(remembered?.name ?? "");
  const [phone, setPhone] = useState(remembered?.phone.replace(/^\+91/, "") ?? "");
  const [place, setPlace] = useState(defaults?.place ?? "");
  const [area, setArea] = useState(defaults?.area ?? "");
  const [landType, setLandType] = useState<string>(defaults?.landType ?? "");
  const [budget, setBudget] = useState<string>(defaults?.budgetMax && BUDGETS.some((b) => b.value === defaults.budgetMax) ? defaults.budgetMax : "");
  const [errors, setErrors] = useState<{ name?: string; phone?: string; place?: string; area?: string }>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    const cleanName = name.replace(/\s+/g, " ").trim();
    const cleanPlace = place.replace(/\s+/g, " ").trim();
    const cleanArea = area.replace(/\s+/g, " ").trim();
    if (cleanName.length < 2) next.name = "Please enter your name";
    else if (!NAME.test(cleanName)) next.name = "Please use letters only";
    const normalized = normalizePhoneNumber(phone);
    if (!normalized.valid) next.phone = "Enter a valid 10-digit mobile number";
    if (cleanPlace.length < 2) next.place = "Which city, town or district?";
    else if (!PLACE.test(cleanPlace)) next.place = "Please use letters and numbers only";
    if (cleanArea && !PLACE.test(cleanArea)) next.area = "Please use letters and numbers only";
    setErrors(next);
    if (Object.keys(next).length > 0 || !normalized.valid) return;

    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/buyer-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: normalized.normalized,
          place: cleanPlace,
          ...(cleanArea ? { area: cleanArea } : {}),
          ...(landType ? { landType } : {}),
          ...(budget ? { budgetMax: Number(budget) } : {}),
        }),
      });
      if (res.ok) {
        storeBuyer({ name: cleanName, phone: normalized.normalized });
        return setStatus({ kind: "done", place: cleanPlace });
      }
      setStatus({
        kind: "error",
        message: res.status === 429 ? "You've sent a few already. Please try again a little later." : "Please check the details and try again.",
      });
    } catch {
      setStatus({ kind: "error", message: "No internet connection. Please try again." });
    }
  }

  if (status.kind === "done") {
    return (
      <div className="pb-safe px-5 pt-8 text-center sm:p-8">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-8 ring-brand-50/50">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 className="mt-5 text-xl font-bold text-ink">You&apos;re on the list</h2>
        <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-muted">
          We&apos;ll WhatsApp you on +91 {phone.replace(/\D/g, "").slice(-10)} as soon as matching land in {status.place} is listed.
        </p>
        <Button type="button" size="lg" variant="secondary" className="mt-6 mb-3 w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  const sending = status.kind === "sending";
  return (
    <form onSubmit={submit} noValidate className="pb-safe px-5 pt-3 sm:p-7">
      <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink">Tell us what you need</h2>
          <p className="mt-1 text-sm text-muted">We&apos;ll WhatsApp you when matching land is listed. Free, no login.</p>
        </div>
        <button type="button" onClick={onClose} className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City, town or district" htmlFor={`${id}-place`} error={errors.place}>
            <Input id={`${id}-place`} list={`${id}-places`} value={place} maxLength={60} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Mohali" autoComplete="address-level2" />
            <datalist id={`${id}-places`}>
              {places.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field label="Village or area" htmlFor={`${id}-area`} error={errors.area} optional>
            <Input id={`${id}-area`} value={area} maxLength={80} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Sector 82" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Field label="Land type" htmlFor={`${id}-type`} optional>
            <Select id={`${id}-type`} value={landType} onChange={(e) => setLandType(e.target.value)}>
              <option value="">Any land</option>
              {(Object.keys(LAND_TYPES) as LandType[]).map((t) => (
                <option key={t} value={t}>
                  {LAND_TYPES[t].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget" htmlFor={`${id}-budget`} optional>
            <Select id={`${id}-budget`} value={budget} onChange={(e) => setBudget(e.target.value)}>
              <option value="">Any budget</option>
              {BUDGETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Your name" htmlFor={`${id}-name`} error={errors.name}>
          <Input id={`${id}-name`} autoComplete="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amit Kumar" />
        </Field>
        <Field label="WhatsApp number" htmlFor={`${id}-phone`} error={errors.phone}>
          <div className="flex">
            <span className="flex h-12 items-center rounded-l-xl border border-r-0 border-line-strong bg-mist px-3.5 text-[15px] font-medium text-ink-soft md:h-11">+91</span>
            <Input
              id={`${id}-phone`}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
              placeholder="98765 43210"
              className="rounded-l-none"
            />
          </div>
        </Field>
      </div>

      {status.kind === "error" && (
        <p role="alert" className="mt-4 text-sm font-medium text-danger">
          {status.message}
        </p>
      )}
      <Button type="submit" size="xl" disabled={sending} className={cn("mt-6 w-full", sending && "opacity-80")}>
        {sending ? "Sending…" : "Tell me when it's listed"}
      </Button>
      <p className="mt-3 mb-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ShieldCheck className="size-3.5 shrink-0 text-brand-600" aria-hidden />
        Only our team sees your number. We use it just for this.
      </p>
    </form>
  );
}
