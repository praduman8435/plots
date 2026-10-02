"use client";

import { Loader2, Play, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { runAvailabilityChecksAction, type RunChecksResult } from "@/server/actions/admin/listings";
import { toast } from "./toast";

/** "Run weekly check now" + the counts it returned, shown until dismissed. */
export function RunChecksButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RunChecksResult["counts"] | null>(null);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
      <Button
        type="button"
        variant="dark"
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Ask every seller whose live plots weren't confirmed in 7 days, and hide plots whose check went unanswered for 24 hours?")) return;
          startTransition(async () => {
            try {
              const r = await runAvailabilityChecksAction();
              toast(r.message, r.ok ? "success" : "error");
              if (r.ok) setResult(r.counts);
            } catch {
              toast("Something went wrong. Try again.", "error");
            }
          });
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : <Play />}
        {pending ? "Running…" : "Run weekly check now"}
      </Button>
      {result && (
        <div role="status" className="flex items-center gap-2 rounded-2xl border border-line bg-white py-1.5 pr-1.5 pl-3 text-sm shadow-soft">
          <p className="tabular flex flex-1 flex-wrap gap-x-3 gap-y-0.5">
            <Count label="sent" value={result.checksSent} />
            <Count label="couldn’t reach" value={result.undelivered} warn={result.undelivered > 0} />
            <Count label="hidden" value={result.hiddenNoReply} warn={result.hiddenNoReply > 0} />
          </p>
          <button
            type="button"
            onClick={() => setResult(null)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-mist"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className={warn ? "font-bold text-amber-700" : "font-bold text-ink"}>{value}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}
