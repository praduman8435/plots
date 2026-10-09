"use client";

import { BellRing, CheckCheck, Eye, EyeOff, Handshake, Loader2, MessageSquarePlus, RotateCcw, Search, ShieldBan, ShieldCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { HiddenReason, ListingStatus, ReportStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { OUTCOME_LABELS } from "@/lib/reports";
import { changeListingStatusAction, sendAvailabilityCheckAction, type AdminActionResult } from "@/server/actions/admin/listings";
import { addReportNoteAction, setReportStatusAction } from "@/server/actions/admin/reports";
import { setSellerBlockedAction } from "@/server/actions/admin/sellers";
import { toast } from "./toast";

type Props = {
  report: { id: string; status: ReportStatus; target: "LISTING" | "PROFILE" };
  listing: { id: string; status: ListingStatus; hiddenReason: HiddenReason | null } | null;
  seller: { id: string; isBlocked: boolean };
  /** Other open reports about the same plot / profile (closable together). */
  relatedOpen: number;
};

type Dialog =
  | { kind: "resolve" }
  | { kind: "dismiss" }
  | { kind: "note" }
  | {
      kind: "confirm";
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean;
      noteRequired?: boolean;
      run: (note: string) => Promise<AdminActionResult>;
    };

const fieldClass =
  "mt-1 w-full rounded-xl border border-line-strong bg-white px-3 py-2.5 text-[15px] text-ink focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none";

/**
 * Everything an admin can do from a report. Every action goes through the
 * same server actions as the rest of the admin (which check the admin session
 * and the allowed status transitions) and is audit-logged against this report.
 * High-impact actions ask for confirmation and a reason.
 */
export function ReportModeration({ report, listing, seller, relatedOpen }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<keyof typeof OUTCOME_LABELS>("NO_ACTION");
  const [includeRelated, setIncludeRelated] = useState(true);
  const [pending, startTransition] = useTransition();
  const ctx = (n: string) => ({ reportId: report.id, note: n || undefined });
  const open = report.status === "PENDING" || report.status === "UNDER_REVIEW";

  function show(d: Dialog) {
    setNote("");
    setDialog(d);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function exec(fn: () => Promise<AdminActionResult>, closeAfter = true) {
    startTransition(async () => {
      try {
        const r = await fn();
        toast(r.message ?? "Done", r.ok ? "success" : "error");
        if (r.ok) {
          if (closeAfter) dialogRef.current?.close();
          router.refresh();
        }
      } catch {
        toast("Something went wrong. Check your connection and try again.", "error");
      }
    });
  }

  function submitDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog || pending) return;
    if (dialog.kind === "resolve") exec(() => setReportStatusAction(report.id, { status: "RESOLVED", outcome, note: note || undefined, includeRelated: relatedOpen > 0 && includeRelated }));
    else if (dialog.kind === "dismiss") exec(() => setReportStatusAction(report.id, { status: "DISMISSED", note, includeRelated: relatedOpen > 0 && includeRelated }));
    else if (dialog.kind === "note") exec(() => addReportNoteAction(report.id, note));
    else {
      if (dialog.noteRequired && note.trim().length < 3) return toast("Add a short reason first.", "error");
      exec(() => dialog.run(note.trim()));
    }
  }

  // ── Listing actions allowed by the listing's current state (the server re-checks) ──
  const listingActions: ReactNode[] = [];
  if (listing) {
    const live = listing.status === "ACTIVE";
    const unconfirmed = listing.status === "HIDDEN" && listing.hiddenReason === "AVAILABILITY_UNCONFIRMED";
    if ((live || unconfirmed) && !seller.isBlocked) {
      listingActions.push(
        <ActionButton key="check" icon={<BellRing />} onClick={() => show({ kind: "confirm", title: "Ask the seller if it's still available?", body: "Sends the usual WhatsApp availability check. If they don't reply in 24 hours the plot is hidden automatically — nothing is marked sold without them.", confirmLabel: "Send check", run: (n) => sendAvailabilityCheckAction(listing.id, ctx(n)) })}>
          Ask seller: still available?
        </ActionButton>,
      );
    }
    if (live || listing.status === "HIDDEN") {
      listingActions.push(
        <ActionButton key="sold" icon={<Handshake />} onClick={() => show({ kind: "confirm", title: "Mark this plot sold?", body: "Only after you've confirmed it with the seller. Buyers will see it as sold and it stops appearing in search. You can relist it later.", confirmLabel: "Mark sold", noteRequired: true, run: (n) => changeListingStatusAction(listing.id, { type: "MARK_SOLD" }, ctx(n)) })}>
          Mark sold
        </ActionButton>,
      );
    }
    if (live) {
      listingActions.push(
        <ActionButton key="hide" icon={<EyeOff />} danger onClick={() => show({ kind: "confirm", title: "Hide this plot from buyers?", body: "It disappears from search and its page stops opening, until an admin unhides it. The seller is told on WhatsApp (without mentioning any report).", confirmLabel: "Hide plot", danger: true, noteRequired: true, run: (n) => changeListingStatusAction(listing.id, { type: "HIDE" }, ctx(n)) })}>
          Hide from buyers
        </ActionButton>,
      );
    }
    if (listing.status === "HIDDEN") {
      listingActions.push(
        <ActionButton key="unhide" icon={<Eye />} onClick={() => show({ kind: "confirm", title: "Show this plot to buyers again?", body: "It goes back to search and its page opens again.", confirmLabel: "Restore plot", noteRequired: true, run: (n) => changeListingStatusAction(listing.id, { type: "UNHIDE" }, ctx(n)) })}>
          Restore (unhide)
        </ActionButton>,
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Report workflow */}
      <div className="flex flex-wrap gap-2">
        {report.status === "PENDING" && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => setReportStatusAction(report.id, { status: "UNDER_REVIEW" }), false)}>
            {pending ? <Loader2 className="animate-spin" /> : <Search />} Start review
          </Button>
        )}
        {open && (
          <>
            <Button type="button" size="sm" onClick={() => show({ kind: "resolve" })}>
              <CheckCheck /> Resolve
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => show({ kind: "dismiss" })}>
              <XCircle /> Dismiss
            </Button>
          </>
        )}
        {!open && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => exec(() => setReportStatusAction(report.id, { status: "UNDER_REVIEW" }), false)}>
            <RotateCcw /> Reopen
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => show({ kind: "note" })}>
          <MessageSquarePlus /> Add note
        </Button>
      </div>

      {/* Moderation of the target */}
      <div className="rounded-2xl bg-mist/70 p-3 ring-1 ring-line">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Take action</p>
        <div className="flex flex-wrap gap-2">
          {listingActions}
          {seller.isBlocked ? (
            <ActionButton icon={<ShieldCheck />} onClick={() => show({ kind: "confirm", title: "Lift the suspension?", body: "The seller can sign in and list again. Their hidden plots stay hidden until you restore them one by one.", confirmLabel: "Lift suspension", noteRequired: true, run: (n) => setSellerBlockedAction(seller.id, false, ctx(n)) })}>
              Lift seller suspension
            </ActionButton>
          ) : (
            <ActionButton icon={<ShieldBan />} danger onClick={() => show({ kind: "confirm", title: "Suspend this seller?", body: "Only with clear evidence — a single unverified report isn't enough. They're signed out, can't list, and ALL their live plots are hidden from buyers.", confirmLabel: "Suspend seller", danger: true, noteRequired: true, run: (n) => setSellerBlockedAction(seller.id, true, ctx(n)) })}>
              Suspend seller
            </ActionButton>
          )}
        </div>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${ids}-t`}
        onClose={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className="m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-3xl"
      >
        {dialog && (
          <form onSubmit={submitDialog} className="pb-safe flex flex-col gap-3 px-5 pt-5 sm:p-6">
            <h2 id={`${ids}-t`} className="text-lg font-bold text-ink">
              {dialog.kind === "resolve" ? "Resolve report" : dialog.kind === "dismiss" ? "Dismiss report" : dialog.kind === "note" ? "Internal note" : dialog.title}
            </h2>
            {dialog.kind === "confirm" && <p className="text-sm text-ink-soft">{dialog.body}</p>}
            {dialog.kind === "dismiss" && <p className="text-sm text-ink-soft">For reports that are unfounded, irrelevant or malicious. Nothing changes for the seller.</p>}
            {dialog.kind === "note" && <p className="text-sm text-ink-soft">Only admins see notes. Never shown to the seller or the reporter.</p>}

            {dialog.kind === "resolve" && (
              <label className="text-sm font-semibold text-ink">
                Outcome
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as keyof typeof OUTCOME_LABELS)} className={fieldClass}>
                  {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="text-sm font-semibold text-ink">
              {dialog.kind === "note" ? "Note" : dialog.kind === "dismiss" || (dialog.kind === "confirm" && dialog.noteRequired) ? "Reason (for the audit log)" : "Note (optional)"}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                required={dialog.kind === "note" || dialog.kind === "dismiss" || (dialog.kind === "confirm" && dialog.noteRequired)}
                className={cn(fieldClass, "resize-none")}
                placeholder="What did you check? What did the seller say?"
              />
            </label>

            {(dialog.kind === "resolve" || dialog.kind === "dismiss") && relatedOpen > 0 && (
              <label className="flex items-start gap-2.5 text-sm text-ink-soft">
                <input type="checkbox" checked={includeRelated} onChange={(e) => setIncludeRelated(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                Also close the {relatedOpen} other open report{relatedOpen === 1 ? "" : "s"} about this {report.target === "LISTING" ? "plot" : "profile"}
              </label>
            )}

            <div className="mt-1 mb-2 flex gap-2">
              <Button type="submit" className="flex-1" variant={dialog.kind === "confirm" && dialog.danger ? "danger" : "primary"} disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                {dialog.kind === "resolve" ? "Resolve" : dialog.kind === "dismiss" ? "Dismiss" : dialog.kind === "note" ? "Save note" : dialog.confirmLabel}
              </Button>
              <Button type="button" variant="ghost" onClick={() => dialogRef.current?.close()}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}

function ActionButton({ icon, danger, onClick, children }: { icon: ReactNode; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant={danger ? "danger" : "secondary"} onClick={onClick}>
      {icon} {children}
    </Button>
  );
}
