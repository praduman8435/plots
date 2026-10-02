"use client";

import { Loader2, ShieldBan, ShieldCheck } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setSellerBlockedAction } from "@/server/actions/admin/sellers";
import { toast } from "./toast";

export function BlockSellerButton({ sellerId, isBlocked }: { sellerId: string; isBlocked: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={isBlocked ? "secondary" : "danger"}
      size="sm"
      className="h-11 sm:h-9"
      disabled={pending}
      onClick={() => {
        const msg = isBlocked
          ? "Unblock this seller? They can sign in and list plots again."
          : "Block this seller? They'll be signed out and their live plots hidden from buyers.";
        if (!window.confirm(msg)) return;
        startTransition(async () => {
          try {
            const r = await setSellerBlockedAction(sellerId, !isBlocked);
            toast(r.message ?? "Done", r.ok ? "success" : "error");
          } catch {
            toast("Something went wrong. Try again.", "error");
          }
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : isBlocked ? <ShieldCheck /> : <ShieldBan />}
      {isBlocked ? "Unblock" : "Block seller"}
    </Button>
  );
}
