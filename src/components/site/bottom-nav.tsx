"use client";

import { Home, Plus, Search, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const items = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/sell", label: "Sell", icon: Plus, match: (p: string) => p.startsWith("/sell"), primary: true },
  { href: "/seller", label: "My plots", icon: UserRound, match: (p: string) => p.startsWith("/seller") },
];

/** App-style tab bar on phones. Hidden on plot pages, which have their own contact bar. */
export function BottomNav() {
  const pathname = usePathname();
  // Plot pages have their own contact bar; form pages have a sticky submit bar.
  if (pathname.startsWith("/property/") || pathname.startsWith("/seller/plots/") || pathname.startsWith("/sell/start")) return null;

  return (
    <nav
      aria-label="Main"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4 px-2 pt-1.5">
        {items.map(({ href, label, icon: Icon, match, primary }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl py-1 text-[11px] font-semibold transition",
                  active ? "text-brand-700" : "text-muted",
                )}
              >
                {primary ? (
                  <span className="-mt-5 mb-0.5 flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-brand ring-4 ring-white">
                    <Icon className="size-6" strokeWidth={2.5} aria-hidden />
                  </span>
                ) : (
                  <span className={cn("flex h-8 w-12 items-center justify-center rounded-full transition", active && "bg-brand-50")}>
                    <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                  </span>
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
