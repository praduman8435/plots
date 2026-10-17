"use client";

import { CheckCircle2, ExternalLink, EyeOff, Images, IndianRupee, MoreHorizontal, Pencil, RotateCcw, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { editPropertyPath, propertyPhotosPath } from "@/lib/property-code";
import { sellerListingAction, updateSellerPrice } from "@/server/actions/seller/listings";

type Action = Parameters<typeof sellerListingAction>[1];

type Props = {
  id: string;
  code: string;
  slug: string;
  title: string;
  status: "PENDING" | "ACTIVE" | "HIDDEN" | "SOLD" | "REJECTED";
  hiddenReason: string | null;
  awaitingReply: boolean;
  price: number;
  priceNegotiable: boolean;
};

type Confirm = { action: Action; title: string; text: string; cta: string; danger?: boolean };

/**
 * What a seller does with one property: the one action that matters right now
 * (confirm it's available, or bring it back), Edit, and everything else in a
 * "More" sheet — Change price, Edit photos, and Remove listing, which asks first.
 */
export function PlotActions({ id, code, slug, title, status, hiddenReason, awaitingReply, price, priceNegotiable }: Props) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [editingPrice, setEditingPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

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
    setEditingPrice(false);
    setError(null);
    setSaved(null);
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
      {saved && (
        <p role="status" className="mt-2 text-sm font-medium text-brand-700">
          {saved}
        </p>
      )}

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
            <p className="line-clamp-2 font-semibold text-ink">{confirm ? confirm.title : editingPrice ? "Change price" : title}</p>
            <button type="button" onClick={close} className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>

          {editingPrice ? (
            <PriceForm
              initial={price}
              initialNegotiable={priceNegotiable}
              live={status === "ACTIVE"}
              pending={pending}
              error={error}
              onCancel={() => {
                setError(null);
                setEditingPrice(false);
              }}
              onSave={(next, negotiable) => {
                setError(null);
                start(async () => {
                  const r = await updateSellerPrice(id, { price: next, priceNegotiable: negotiable });
                  if (!r.ok) return setError(r.message ?? "Something went wrong. Please try again.");
                  setSaved(`Price updated to ${formatPrice(next)}.`);
                  close();
                });
              }}
            />
          ) : confirm ? (
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
              {status !== "SOLD" && (
                <SheetItem icon={<IndianRupee />} onClick={() => setEditingPrice(true)}>
                  Change price
                </SheetItem>
              )}
              {status !== "SOLD" && (
                <SheetItem as="link" href={propertyPhotosPath(code)} icon={<Images />}>
                  Edit photos
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

/** Total price in ₹ with a live "₹18 Lakh" read-back, so a missing zero is easy to spot. */
function PriceForm({
  initial,
  initialNegotiable,
  live,
  pending,
  error,
  onCancel,
  onSave,
}: {
  initial: number;
  initialNegotiable: boolean;
  live: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (price: number, negotiable: boolean) => void;
}) {
  const [digits, setDigits] = useState(String(initial));
  const [negotiable, setNegotiable] = useState(initialNegotiable);
  const value = Number(digits || 0);
  const tooLow = value > 0 && value < 10_000;
  const unchanged = value === initial && negotiable === initialNegotiable;

  return (
    <form
      className="mt-2 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value >= 10_000 && !unchanged) onSave(value, negotiable);
      }}
    >
      <label htmlFor="new-price" className="text-sm font-medium text-ink-soft">
        Total price (₹)
      </label>
      <div className="mt-1.5 flex h-12 items-center rounded-xl bg-white px-3.5 ring-1 ring-line-strong focus-within:ring-2 focus-within:ring-brand-500">
        <span className="mr-1.5 text-muted">₹</span>
        <input
          id="new-price"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={digits ? new Intl.NumberFormat("en-IN").format(value) : ""}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 11))}
          className="tabular h-full w-full bg-transparent text-lg font-semibold text-ink outline-none"
          aria-describedby="new-price-hint"
        />
      </div>
      <p id="new-price-hint" className={cn("mt-1.5 text-sm", tooLow ? "text-danger" : "text-muted")}>
        {tooLow ? "Price looks too low — enter the total price in ₹" : value ? formatPrice(value) : "Enter the total price for the whole land"}
      </p>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="size-5 accent-brand-600" />
        Price is negotiable
      </label>
      {live && <p className="mt-2 text-[13px] text-muted">Your listing stays live — buyers see the new price right away.</p>}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-5 grid gap-2.5">
        <Button type="submit" size="lg" disabled={pending || value < 10_000 || unchanged} className="w-full">
          {pending ? "Saving…" : "Save price"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onCancel} className="w-full">
          Go back
        </Button>
      </div>
    </form>
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
