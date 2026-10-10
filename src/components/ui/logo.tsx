import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/** The mark: a map pin; through its window, a field runs to the horizon where the sun rises. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("size-8", className)} aria-hidden>
      <rect width="512" height="512" rx="116" className="fill-brand-600" />
      <g transform="translate(16.4 29.2) scale(0.9361)">
        <path d="M151.1 327.1A150 150 0 1 1 360.9 327.1L267.4 418.8Q256 431 244.6 418.8Z" fill="#fff" />
        <circle cx="256" cy="220" r="100" className="fill-brand-600" />
        <path d="M172.7 231H339.3A84 84 0 0 1 172.7 231Z" fill="#fff" />
        <path d="M231.2 227L186.6 280.4M247.6 227L225.1 306.6M264.4 227L286.9 306.6M280.8 227L325.4 280.4" className="stroke-brand-600" strokeWidth="10" />
        <path d="M219 213A37 37 0 0 1 293 213Z" fill="#fff" />
      </g>
    </svg>
  );
}

/** "InstaPlots": "Insta" in ink, "Plots" in brand green (white and mint on dark). */
export function Wordmark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("font-extrabold tracking-tight", inverted ? "text-white" : "text-brand-950", className)}>
      Insta<span className={inverted ? "text-brand-200" : "text-brand-600"}>Plots</span>
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
