import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** Wordmark: a plot-boundary mark (a parcel with a pin) + name. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-brand-600" />
      <path d="M7 21.5 13 9l12 4.5-3.5 10.5L7 21.5Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeDasharray="0" opacity="0.95" />
      <circle cx="16.5" cy="16" r="2.6" fill="#fff" />
    </svg>
  );
}

/** "InstaPlots" — "Insta" in brand green, "Plots" in ink (or green-tint/white on dark). */
export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("font-extrabold tracking-tight", inverted ? "text-white" : "text-brand-950", className)}>
      <span className={inverted ? "text-brand-300" : "text-brand-600"}>Insta</span>Plots
    </span>
  );
}

export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5", className)} aria-label={`${site.name} home`}>
      <LogoMark />
      <Wordmark inverted={inverted} className="text-[1.35rem]" />
    </Link>
  );
}
