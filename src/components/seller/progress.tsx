import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export const SELL_STEPS = ["Your details", "Property details", "Photos", "Submit"] as const;

/** 4-step progress used across sign-up and the listing wizard. `current` is 0-based. */
export function SellProgress({ current, steps = SELL_STEPS }: { current: number; steps?: readonly string[] }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={active ? "step" : undefined}>
            <span className={cn("h-1.5 rounded-full transition-colors", done || active ? "bg-brand-600" : "bg-line")} />
            <span className={cn("flex items-center gap-1 truncate text-[11px] font-semibold sm:text-xs", active ? "text-brand-800" : done ? "text-ink-soft" : "text-faint")}>
              {done && <Check className="size-3 shrink-0" aria-hidden />}
              <span className="truncate">{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
