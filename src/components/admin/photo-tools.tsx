"use client";

import { Loader2, Star, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { cn } from "@/lib/cn";
import { makeListingCoverAction, removeListingPhotoAction, type AdminActionResult } from "@/server/actions/admin/listings";
import { toast } from "./toast";

/**
 * "Make cover" and "Remove" on a photo, right where the reviewer looks at it,
 * so a bad photo can go before approving. Sits on top of the photo (never
 * inside its link) and saves at once; the status doesn't change.
 */
export function PhotoTools({ propertyId, imageId, isCover, className }: { propertyId: string; imageId: string; isCover: boolean; className?: string }) {
  const [pending, start] = useTransition();

  function run(fn: () => Promise<AdminActionResult>) {
    start(async () => {
      try {
        const r = await fn();
        toast(r.message ?? "Done", r.ok ? "success" : "error");
      } catch {
        toast("Something went wrong. Check your connection and try again.", "error");
      }
    });
  }

  return (
    <div className={cn("absolute top-2 right-2 z-10 flex gap-1.5", className)}>
      {!isCover && (
        <ToolButton label="Make this the cover photo" disabled={pending} onClick={() => run(() => makeListingCoverAction(propertyId, imageId))}>
          <Star />
        </ToolButton>
      )}
      <ToolButton
        label="Remove this photo"
        danger
        disabled={pending}
        onClick={() => {
          if (window.confirm("Remove this photo? Buyers won't see it. The seller isn't messaged.")) run(() => removeListingPhotoAction(propertyId, imageId));
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </ToolButton>
    </div>
  );
}

function ToolButton({ label, danger, disabled, onClick, children }: { label: string; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-full bg-white/95 shadow-soft ring-1 ring-black/5 backdrop-blur transition disabled:opacity-60 [&_svg]:size-4",
        danger ? "text-danger hover:bg-red-50" : "text-ink-soft hover:bg-white hover:text-brand-800",
      )}
    >
      {children}
    </button>
  );
}
