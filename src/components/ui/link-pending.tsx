"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * Inside a <Link>: a thin brand bar while that link's page is loading, so a tap
 * on a slow connection gets visible feedback. Appears after 120 ms, so fast
 * navigations never flicker. Position it with `className`.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none overflow-hidden transition-opacity duration-150",
        pending ? "opacity-100 delay-[120ms]" : "opacity-0",
        className,
      )}
    >
      <span className={cn("block h-full w-1/3 rounded-full bg-brand-500", pending && "animate-link-pending")} />
    </span>
  );
}
