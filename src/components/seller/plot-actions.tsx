"use client";

import { CheckCircle2, ExternalLink, EyeOff, MoreHorizontal, Pencil, RotateCcw, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { editPropertyPath } from "@/lib/property-code";
import { sellerListingAction } from "@/server/actions/seller/listings";

type Action = Parameters<typeof sellerListingAction>[1];

type Props = {
  id: string;
  code: string;
  slug: string;
  title: string;
  status: "PENDING" | "ACTIVE" | "HIDDEN" | "SOLD" | "REJECTED";
  hiddenReason: string | null;
  awaitingReply: boolean;
};

type Confirm = { action: Action; title: string; text: string; cta: string; danger?: boolean };

/**
 * What a seller does with one property: the one action that matters right now
 * (confirm it's available, or bring it back), Edit, and everything else in a
 * "More" sheet — including Remove listing, which asks first.
 */
export function PlotActions({ id, code, slug, title, status, hiddenReason, awaitingReply }: Props) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reactivatable = status === "SOLD" || (status === "HIDDEN" && hiddenReason !== "BY_ADMIN");
  const viewable = status === "ACTIVE" || status === "SOLD";

  function run(action: Action, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await sellerListingAction(id, action);
      if (!r.ok) return setError(r.message ?? "Something went wrong. Please try again.");
      after?.();
    });
  }
  const open = () => {
    setConfirm(null);
    setError(null);
    sheet.current?.showModal();
  };
  const close = () => sheet.current?.close();

  return (
    <>
      <div className="flex items-center gap-2">
        {status === "ACTIVE" && awaitingReply && (
          <Button size="sm" disabled={pending} onClick={() => run("CONFIRM_AVAILABLE")} className="flex-1 sm:flex-none">
            <CheckCircle2 /> Yes, still available
          </Button>
        )}
        {reactivatable && (
          <Button size="sm" disabled={pending} onClick={() => run("CONFIRM_AVAILABLE")} className="flex-1 sm:flex-none">
            <RotateCcw /> Make live again
          </Button>
        )}
        {status !== "SOLD" && (
          <Link href={editPropertyPath(code)} className={buttonVariants({ variant: "secondary", size: "sm", className: "flex-1 sm:flex-none" })}>
            <Pencil /> Edit
          </Link>
        )}
        <Button size="icon-sm" variant="secondary" onClick={open} aria-label={`More actions for ${title}`} className="ml-auto shrink-0">
          <MoreHorizontal />
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <dialog
        ref={sheet}
        aria-label={`Actions for ${title}`}
        className="m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className="pb-safe px-5 pt-3 sm:p-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 font-semibold text-ink">{confirm ? confirm.title : title}</p>
            <button type="button" onClick={close} className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>

          {confirm ? (
            <div className="mt-2 pb-3">
              <p className="text-sm leading-relaxed text-muted">{confirm.text}</p>
              {error && <p className="mt-3 text-sm text-danger">{error}</p>}
              <div className="mt-5 grid gap-2.5">
                <Button
                  size="lg"
                  variant={confirm.danger ? "danger" : "primary"}
                  disabled={pending}
                  onClick={() => run(confirm.action, close)}
                  className={cn("w-full", confirm.danger && "border-0 bg-danger text-white hover:bg-red-700")}
                >
                  {pending ? "Please wait…" : confirm.cta}
                </Button>
                <Button size="lg" variant="ghost" onClick={() => setConfirm(null)} className="w-full">
                  Go back
                </Button>
              </div>
            </div>
          ) : (
            <ul className="mt-2 -mx-2 pb-3">
              {viewable && (
                <SheetItem as="link" href={`/property/${slug}`} icon={<ExternalLink />}>
                  View on InstaPlots
                </SheetItem>
              )}
              {status === "ACTIVE" && !awaitingReply && (
                <SheetItem icon={<CheckCircle2 />} disabled={pending} onClick={() => run("CONFIRM_AVAILABLE", close)}>
                  Confirm it&apos;s still available
                </SheetItem>
              )}
              {(status === "ACTIVE" || status === "HIDDEN") && (
                <SheetItem
                  icon={<Tag />}
                  onClick={() => setConfirm({ action: "MARK_SOLD", title: "Mark as sold?", text: "Congratulations! Buyers won't see it any more. If it was a mistake, you can make it live again.", cta: "Yes, it's sold" })}
                >
                  Mark as sold
                </SheetItem>
              )}
              {status === "ACTIVE" && (
                <SheetItem icon={<EyeOff />} disabled={pending} onClick={() => run("HIDE", close)}>
                  Hide from buyers for now
                </SheetItem>
              )}
              <SheetItem
                icon={<Trash2 />}
                danger
                onClick={() =>
                  setConfirm({
                    action: "REMOVE",
                    title: "Remove this listing?",
                    text: "It will be taken off InstaPlots and removed from your list. People who already contacted you stay in “Who contacted me”. This can't be undone.",
                    cta: "Remove listing",
                    danger: true,
                  })
                }
              >
                Remove listing
              </SheetItem>
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

function SheetItem({
  icon,
  children,
  danger = false,
  disabled,
  onClick,
  as,
  href,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  as?: "link";
  href?: string;
}) {
  const cls = cn(
    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] font-medium transition disabled:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0",
    danger ? "text-danger hover:bg-red-50" : "text-ink hover:bg-mist [&_svg]:text-muted",
  );
  return (
    <li>
      {as === "link" && href ? (
        <Link href={href} className={cls}>
          {icon}
          {children}
        </Link>
      ) : (
        <button type="button" disabled={disabled} onClick={onClick} className={cls}>
          {icon}
          {children}
        </button>
      )}
    </li>
  );
}

/** "Remove listing" on the edit page: asks first, then goes back to the dashboard. */
export function RemoveListingButton({ id, title }: { id: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    start(async () => {
      const r = await sellerListingAction(id, "REMOVE");
      if (!r.ok) return setError(r.message ?? "Something went wrong. Please try again.");
      router.push("/seller/dashboard");
    });
  }

  return (
    <>
      <Button type="button" variant="danger" size="md" onClick={() => dialog.current?.showModal()}>
        <Trash2 /> Remove listing
      </Button>
      <dialog
        ref={dialog}
        aria-label={`Remove ${title}`}
        className="m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-sm sm:rounded-3xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="pb-safe px-5 pt-3 sm:p-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <span className="flex size-11 items-center justify-center rounded-full bg-red-50 text-danger">
            <Trash2 className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-lg font-bold text-ink">Remove this listing?</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            It will be taken off InstaPlots and removed from your list. People who already contacted you stay in “Who contacted me”. This can&apos;t be undone.
          </p>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-5 grid gap-2.5 pb-3">
            <Button size="lg" variant="danger" disabled={pending} onClick={remove} className="w-full border-0 bg-danger text-white hover:bg-red-700">
              {pending ? "Please wait…" : "Remove listing"}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => dialog.current?.close()} className="w-full">
              Keep it
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
