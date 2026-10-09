"use client";

import { CheckCircle2, EyeOff, Pencil, RotateCcw, Tag } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { sellerListingAction } from "@/server/actions/seller/listings";

type Props = {
  id: string;
  status: "PENDING" | "ACTIVE" | "HIDDEN" | "SOLD" | "REJECTED";
  hiddenReason: string | null;
  awaitingReply: boolean;
};

/** The few things a seller actually needs to do with a property. */
export function PlotActions({ id, status, hiddenReason, awaitingReply }: Props) {
  const [pending, start] = useTransition();
  const run = (action: Parameters<typeof sellerListingAction>[1], confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await sellerListingAction(id, action);
      if (!r.ok && r.message) window.alert(r.message);
    });
  };
  const reactivatable = status === "SOLD" || (status === "HIDDEN" && hiddenReason !== "BY_ADMIN");

  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "ACTIVE" && (
        <Button size="sm" variant={awaitingReply ? "primary" : "soft"} disabled={pending} onClick={() => run("CONFIRM_AVAILABLE")}>
          <CheckCircle2 /> Still available
        </Button>
      )}
      {reactivatable && (
        <Button size="sm" disabled={pending} onClick={() => run("CONFIRM_AVAILABLE")}>
          <RotateCcw /> Make live again
        </Button>
      )}
      {(status === "ACTIVE" || status === "HIDDEN") && (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("MARK_SOLD", "Mark this property as sold? Buyers won't see it any more.")}>
          <Tag /> Mark sold
        </Button>
      )}
      {status !== "SOLD" && (
        <Link href={`/seller/plots/${id}/edit`} className={buttonVariants({ variant: "ghost", size: "sm", className: "px-2.5" })}>
          <Pencil /> Edit
        </Link>
      )}
      {status === "ACTIVE" && (
        <Button size="sm" variant="ghost" className="px-2.5" disabled={pending} onClick={() => run("HIDE")}>
          <EyeOff /> Hide
        </Button>
      )}
    </div>
  );
}
