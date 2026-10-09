"use client";

import { Check, Copy, Share2, Store, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { profileShareText, whatsappShareLink } from "@/lib/seller-profile";

type CopyState = "idle" | "copied" | "failed";

/** Copies text; falls back to a hidden textarea for older browsers / non-secure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * "Share My Properties": one permanent link to every live plot of a seller.
 * `variant="dashboard"` is the prominent card on the seller dashboard;
 * `variant="button"` is a small share button (public profile page).
 */
export function ShareProfile({ url, name, variant = "dashboard", total }: { url: string; name: string; variant?: "dashboard" | "button" | "icon"; total?: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const text = profileShareText(name, url);

  useEffect(() => {
    // Feature detection must run in the browser (not during server render).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability check after mount
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    if (copy === "idle") return;
    const t = setTimeout(() => setCopy("idle"), 2200);
    return () => clearTimeout(t);
  }, [copy]);

  async function onCopy() {
    setCopy((await copyText(url)) ? "copied" : "failed");
  }

  async function onNativeShare() {
    try {
      await navigator.share({ title: `${name} — properties on InstaPlots`, text, url });
    } catch (err) {
      // User closed the sheet → nothing to do. Anything else → fall back to copying.
      if ((err as DOMException)?.name !== "AbortError") await onCopy();
    }
  }

  const open = () => dialogRef.current?.showModal();

  return (
    <>
      {variant === "dashboard" ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-line @lg:flex-row @lg:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Store className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Share all your properties</p>
            <p className="text-sm text-muted">One link to showcase all your active properties to buyers.</p>
          </div>
          <Button type="button" size="md" onClick={open} className="h-10 shrink-0 @max-lg:w-full">
            <Share2 /> Share My Properties
          </Button>
        </div>
      ) : variant === "icon" ? (
        <button
          type="button"
          onClick={open}
          aria-label={`Share ${name}'s properties`}
          className="flex size-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur transition hover:bg-white"
        >
          <Share2 className="size-[18px]" />
        </button>
      ) : (
        <Button type="button" size="lg" onClick={open} className="w-full sm:w-auto">
          <WhatsAppIcon /> Share this page
        </Button>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-0 mt-auto w-full max-w-none rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up sm:m-auto sm:max-w-md sm:rounded-3xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="pb-safe px-5 pt-3 sm:p-6">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-lg font-bold text-ink">
                {variant === "dashboard" ? "Share your properties" : `Share ${name}'s properties`}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {variant === "dashboard"
                  ? "This link always shows your live properties — it never changes."
                  : `${total ?? "All"} available ${total === 1 ? "property" : "properties"} in one link.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-mist p-1.5 pl-3 ring-1 ring-line">
            <input
              readOnly
              value={url}
              aria-label="Profile link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink-soft focus:outline-none"
            />
            <Button type="button" size="sm" variant={copy === "copied" ? "soft" : "primary"} onClick={onCopy} className="shrink-0">
              {copy === "copied" ? <Check /> : <Copy />}
              {copy === "copied" ? "Copied" : "Copy"}
            </Button>
          </div>
          <p role="status" aria-live="polite" className={cn("mt-1.5 min-h-5 text-xs", copy === "failed" ? "text-danger" : "text-brand-700")}>
            {copy === "copied" && "Link copied — paste it anywhere."}
            {copy === "failed" && "Couldn't copy automatically. Tap the link above and copy it."}
          </p>

          <div className="mt-2 grid gap-2.5">
            <a
              href={whatsappShareLink(text)}
              target="_blank"
              rel="noopener"
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand-600 text-[15px] font-semibold text-white transition hover:bg-brand-700"
            >
              <WhatsAppIcon className="size-5" /> Share on WhatsApp
            </a>
            <Button type="button" size="lg" variant="secondary" onClick={canNativeShare ? onNativeShare : onCopy} className="w-full">
              <Share2 /> {canNativeShare ? "More sharing options" : "Copy link to share"}
            </Button>
          </div>
          <p className="mt-3 mb-2 text-center text-xs text-muted">Works in WhatsApp groups, Facebook, Instagram bio and SMS.</p>
        </div>
      </dialog>
    </>
  );
}
