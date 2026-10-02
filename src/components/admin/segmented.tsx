import Link from "next/link";
import { cn } from "@/lib/cn";

/** A row of link "tabs" (time range, channel…). Full width on phones. */
export function Segmented({ label, options }: { label: string; options: { label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="grid auto-cols-fr grid-flow-col rounded-full border border-line-strong bg-white p-1 shadow-soft sm:inline-grid">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={cn(
            "flex h-10 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition sm:px-4",
            o.active ? "bg-brand-950 text-white" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
