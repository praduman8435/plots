"use client";

import { BellRing, Check, CheckCheck, EyeOff, Eye, Handshake, Loader2, PencilLine, RotateCcw, X } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import type { HiddenReason, ListingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import {
  changeListingStatusAction,
  sendAvailabilityCheckAction,
  type AdminActionResult,
  type AdminStatusAction,
} from "@/server/actions/admin/listings";
import { toast } from "./toast";

type ActionKey = AdminStatusAction["type"] | "SEND_CHECK";

const REJECT_REASONS = [
  "Photos are unclear or not of the land",
  "Price or size looks wrong",
  "Duplicate of another listing",
  "Couldn't reach the seller to verify",
  "Not land for sale",
];

function useRunner() {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<ActionKey | null>(null);
  function run(key: ActionKey, fn: () => Promise<AdminActionResult>, onDone?: () => void) {
    setRunning(key);
    startTransition(async () => {
      try {
        const r = await fn();
        toast(r.message ?? "Done", r.ok ? "success" : "error");
        if (r.ok) onDone?.();
      } catch {
        toast("Something went wrong. Check your connection and try again.", "error");
      } finally {
        setRunning(null);
      }
    });
  }
  return { pending, running, run };
}

function RejectDialog({
  dialogRef,
  onSubmit,
  pending,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const close = () => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 sm:m-auto sm:max-w-lg"
      aria-label="Reject listing"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim().length >= 3) onSubmit(reason.trim());
        }}
        className="pb-safe animate-sheet-up rounded-t-3xl bg-white p-5 shadow-lift sm:animate-fade-up sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink">Reject this listing?</h2>
            <p className="mt-1 text-sm text-muted">The seller gets this reason on WhatsApp, so keep it kind and specific.</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {REJECT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1.5 text-left text-[13px] font-medium transition",
                reason === r ? "border-red-300 bg-red-50 text-red-800" : "border-line-strong bg-white text-ink-soft hover:border-red-200",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          className="mt-3 min-h-24"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for the seller…"
          maxLength={500}
          aria-label="Reason"
        />
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={pending || reason.trim().length < 3} className="border-red-600 bg-red-600 text-white hover:bg-red-700">
            {pending ? <Loader2 className="animate-spin" /> : <X />}
            Reject and notify seller
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** One-tap Approve / Reject / Edit for the review queue. */
export function ReviewActions({ propertyId, className }: { propertyId: string; className?: string }) {
  const { pending, running, run } = useRunner();
  const rejectRef = useRef<HTMLDialogElement>(null);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        type="button"
        size="md"
        className="h-10 flex-1 px-4"
        onClick={() => run("APPROVE", () => changeListingStatusAction(propertyId, { type: "APPROVE" }))}
        disabled={pending}
      >
        {running === "APPROVE" ? <Loader2 className="animate-spin" /> : <Check />}
        Approve
      </Button>
      <Button
        type="button"
        size="md"
        variant="ghost"
        className="h-10 px-4 text-danger hover:bg-red-50 hover:text-danger"
        onClick={() => rejectRef.current?.showModal()}
        disabled={pending}
      >
        Reject
      </Button>
      <ButtonLink
        href={`/admin/listings/${propertyId}#edit`}
        variant="ghost"
        size="md"
        className="size-10 px-0 sm:w-auto sm:px-4"
        aria-label="Edit listing"
        title="Edit"
      >
        <PencilLine aria-hidden /> <span className="hidden sm:inline">Edit</span>
      </ButtonLink>
      <RejectDialog
        dialogRef={rejectRef}
        pending={running === "REJECT"}
        onSubmit={(reason) =>
          run("REJECT", () => changeListingStatusAction(propertyId, { type: "REJECT", reason }), () => rejectRef.current?.close())
        }
      />
    </div>
  );
}

type PanelAction = {
  key: ActionKey;
  label: string;
  hint: string;
  icon: ReactNode;
  variant: "primary" | "secondary" | "danger" | "soft";
  confirm?: string;
};

function actionsFor(status: ListingStatus, hiddenReason: HiddenReason | null): PanelAction[] {
  const approve: PanelAction = { key: "APPROVE", label: "Approve and publish", hint: "Goes live; the seller is told on WhatsApp.", icon: <Check />, variant: "primary" };
  const reject: PanelAction = { key: "REJECT", label: "Reject…", hint: "Ask for a reason; the seller is told on WhatsApp.", icon: <X />, variant: "danger" };
  const sold: PanelAction = { key: "MARK_SOLD", label: "Mark sold", hint: "Removes it from search for good.", icon: <Handshake />, variant: "secondary", confirm: "Mark this plot as sold? Buyers will no longer see it." };
  const check: PanelAction = { key: "SEND_CHECK", label: "Send availability check now", hint: "“Is your plot still available?” on WhatsApp. 24h to reply.", icon: <BellRing />, variant: "secondary" };
  switch (status) {
    case "PENDING":
      return [approve, reject];
    case "ACTIVE":
      return [
        { key: "CONFIRM_AVAILABLE", label: "Mark available", hint: "Seller confirmed by phone — no check for another 7 days.", icon: <CheckCheck />, variant: "soft" },
        check,
        { key: "HIDE", label: "Hide from buyers", hint: "Temporarily off the site. Reversible.", icon: <EyeOff />, variant: "secondary" },
        sold,
        reject,
      ];
    case "HIDDEN":
      return hiddenReason === "AVAILABILITY_UNCONFIRMED"
        ? [
            { key: "CONFIRM_AVAILABLE", label: "Mark available", hint: "Back to live; the seller is told on WhatsApp.", icon: <CheckCheck />, variant: "primary" },
            { ...check, hint: "Ask again on WhatsApp. A YES puts it back live." },
            sold,
            reject,
          ]
        : [{ key: "UNHIDE", label: "Unhide", hint: "Back to live.", icon: <Eye />, variant: "primary" }, sold, reject];
    case "SOLD":
      return [{ ...approve, label: "Relist", hint: "Seller says the deal fell through — goes live again.", icon: <RotateCcw />, variant: "secondary" }];
    case "REJECTED":
      return [{ ...approve, label: "Approve anyway", hint: "Publish after the seller fixed the issue." }];
  }
}

/** Every allowed action for the listing's current status (detail page). */
export function StatusPanelActions({
  propertyId,
  status,
  hiddenReason,
}: {
  propertyId: string;
  status: ListingStatus;
  hiddenReason: HiddenReason | null;
}) {
  const { pending, running, run } = useRunner();
  const rejectRef = useRef<HTMLDialogElement>(null);
  const actions = actionsFor(status, hiddenReason);

  function onClick(a: PanelAction) {
    if (a.key === "REJECT") return rejectRef.current?.showModal();
    if (a.confirm && !window.confirm(a.confirm)) return;
    if (a.key === "SEND_CHECK") return run(a.key, () => sendAvailabilityCheckAction(propertyId));
    const key = a.key;
    run(key, () => changeListingStatusAction(propertyId, { type: key } as AdminStatusAction));
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => (
        <button
          key={a.key + a.label}
          type="button"
          disabled={pending}
          onClick={() => onClick(a)}
          className={cn(
            "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-60 [&_svg]:size-[18px]",
            a.variant === "primary" && "border-brand-600 bg-brand-600 text-white shadow-brand hover:bg-brand-700",
            a.variant === "soft" && "border-brand-100 bg-brand-50 text-brand-900 hover:bg-brand-100",
            a.variant === "secondary" && "border-line-strong bg-white text-ink hover:border-brand-300",
            a.variant === "danger" && "border-red-200 bg-white text-danger hover:bg-red-50",
          )}
        >
          <span className="shrink-0">{running === a.key ? <Loader2 className="animate-spin" /> : a.icon}</span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">{a.label}</span>
            <span className={cn("block text-xs", a.variant === "primary" ? "text-brand-100" : "text-muted")}>{a.hint}</span>
          </span>
        </button>
      ))}
      <RejectDialog
        dialogRef={rejectRef}
        pending={running === "REJECT"}
        onSubmit={(reason) =>
          run("REJECT", () => changeListingStatusAction(propertyId, { type: "REJECT", reason }), () => rejectRef.current?.close())
        }
      />
    </div>
  );
}

/** Compact row actions for the availability page. */
export function AvailabilityRowActions({ propertyId, showCheck = true }: { propertyId: string; showCheck?: boolean }) {
  const { pending, running, run } = useRunner();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
      {showCheck && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-11 sm:h-9"
          disabled={pending}
          onClick={() => run("SEND_CHECK", () => sendAvailabilityCheckAction(propertyId))}
        >
          {running === "SEND_CHECK" ? <Loader2 className="animate-spin" /> : <BellRing />} Send check
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="soft"
        className="h-11 sm:h-9"
        disabled={pending}
        onClick={() => run("CONFIRM_AVAILABLE", () => changeListingStatusAction(propertyId, { type: "CONFIRM_AVAILABLE" }))}
      >
        {running === "CONFIRM_AVAILABLE" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Mark available
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className={cn("h-11 sm:h-9", !showCheck && "col-span-1")}
        disabled={pending}
        onClick={() => {
          if (window.confirm("Mark this plot as sold? Buyers will no longer see it.")) {
            run("MARK_SOLD", () => changeListingStatusAction(propertyId, { type: "MARK_SOLD" }));
          }
        }}
      >
        {running === "MARK_SOLD" ? <Loader2 className="animate-spin" /> : <Handshake />} Mark sold
      </Button>
    </div>
  );
}
