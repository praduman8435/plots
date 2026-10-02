"use client";

import {
  ArrowUpRight,
  CalendarCheck,
  ChartColumn,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageCircle,
  PhoneIncoming,
  Plus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo, LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { adminLogout } from "@/server/actions/admin/auth";
import { Toaster } from "./toast";

type NavKey = "overview" | "review" | "listings" | "sellers" | "enquiries" | "whatsapp" | "availability" | "insights";
type NavItem = { key: NavKey; href: string; label: string; short: string; icon: LucideIcon; count?: number; tone?: "amber" | "brand" };

export type AdminShellProps = {
  admin: { name: string; email: string };
  counts: { pending: number; unreadChats: number; needsAttention: number };
  children: ReactNode;
};

function useActiveKey(): NavKey | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname === "/admin") return "overview";
  if (pathname.startsWith("/admin/listings")) {
    return pathname === "/admin/listings" && searchParams.get("status") === "PENDING" ? "review" : "listings";
  }
  for (const key of ["sellers", "enquiries", "whatsapp", "availability", "insights"] as const) {
    if (pathname.startsWith(`/admin/${key}`)) return key;
  }
  return null;
}

function CountBadge({ count, tone = "brand", className }: { count?: number; tone?: "amber" | "brand"; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-bold",
        tone === "amber" ? "bg-amber-400 text-amber-950" : "bg-brand-600 text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AdminShell({ admin, counts, children }: AdminShellProps) {
  const active = useActiveKey();
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openMore = () => dialogRef.current?.showModal();
  const closeMore = () => dialogRef.current?.close();

  const items: NavItem[] = [
    { key: "overview", href: "/admin", label: "Today", short: "Today", icon: LayoutDashboard },
    { key: "review", href: "/admin/listings?status=PENDING", label: "Review", short: "Review", icon: ClipboardCheck, count: counts.pending, tone: "amber" },
    { key: "listings", href: "/admin/listings", label: "Listings", short: "Listings", icon: Map },
    { key: "sellers", href: "/admin/sellers", label: "Sellers", short: "Sellers", icon: Users },
    { key: "enquiries", href: "/admin/enquiries", label: "Enquiries", short: "Enquiries", icon: PhoneIncoming },
    { key: "whatsapp", href: "/admin/whatsapp", label: "WhatsApp", short: "Chats", icon: MessageCircle, count: counts.unreadChats },
    { key: "availability", href: "/admin/availability", label: "Availability", short: "Availability", icon: CalendarCheck, count: counts.needsAttention, tone: "amber" },
    { key: "insights", href: "/admin/insights", label: "Insights", short: "Insights", icon: ChartColumn },
  ];
  const byKey = Object.fromEntries(items.map((i) => [i.key, i])) as Record<NavKey, NavItem>;
  const tabs = [byKey.overview, byKey.review, byKey.listings, byKey.whatsapp];
  const moreItems = [byKey.availability, byKey.sellers, byKey.enquiries, byKey.insights];
  const moreActive = moreItems.some((i) => i.key === active);
  const moreCount = moreItems.reduce((n, i) => n + (i.count ?? 0), 0);

  // Close the sheet whenever navigation happens.
  useEffect(() => {
    dialogRef.current?.close();
  }, [pathname]);

  const signOut = (
    <form action={adminLogout}>
      <button
        type="submit"
        className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-soft transition hover:bg-red-50 hover:text-danger"
      >
        <LogOut className="size-[18px]" aria-hidden />
        Sign out
      </button>
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-1 [--sticky-bottom:calc(3.75rem+env(safe-area-inset-bottom))] lg:[--sticky-bottom:0px]">
      {/* ── Desktop sidebar ── */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 px-5">
          <Logo />
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-700 uppercase ring-1 ring-brand-100">
            Admin
          </span>
        </div>
        <div className="px-3 pt-2 pb-3">
          <ButtonLink href="/admin/listings/new" size="sm" className="w-full">
            <Plus /> Add plot for a seller
          </ButtonLink>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Admin">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              const isActive = active === item.key;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition",
                      isActive ? "bg-brand-50 text-brand-800" : "text-ink-soft hover:bg-mist hover:text-ink",
                    )}
                  >
                    <item.icon
                      className={cn("size-[18px]", isActive ? "text-brand-600" : "text-faint group-hover:text-muted")}
                      aria-hidden
                    />
                    <span className="flex-1">{item.label}</span>
                    <CountBadge count={item.count} tone={item.tone} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-soft transition hover:bg-mist hover:text-ink"
          >
            <ArrowUpRight className="size-[18px]" aria-hidden />
            View site
          </a>
          {signOut}
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-mist px-3 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {admin.name.trim().charAt(0).toUpperCase() || "A"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{admin.name}</p>
              <p className="truncate text-xs text-muted">{admin.email}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Mobile top bar ── */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-3 border-b border-line bg-white/90 px-4 backdrop-blur-md lg:hidden">
          <Link href="/admin" className="flex items-center gap-2" aria-label="Admin overview">
            <LogoMark className="size-6" />
            <span className="text-base font-extrabold tracking-tight text-brand-950">Plots</span>
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-brand-700 uppercase ring-1 ring-brand-100">
              Admin
            </span>
          </Link>
          <ButtonLink href="/admin/listings/new" size="sm" variant="soft" className="h-8 px-3 text-[13px]" aria-label="Add plot for a seller">
            <Plus /> Add plot
          </ButtonLink>
        </header>

        <main className="flex-1 pb-[calc(var(--sticky-bottom)+1.5rem)] lg:pb-10">
          <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-10 lg:pt-8">{children}</div>
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        aria-label="Admin"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pt-1.5 backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((item) => {
            const isActive = active === item.key;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative flex h-[3.25rem] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition",
                    isActive ? "text-brand-700" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-7 w-12 items-center justify-center rounded-full transition",
                      isActive && "bg-brand-50",
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                    <CountBadge count={item.count} tone={item.tone} className="absolute -top-1 -right-0.5 ring-2 ring-white" />
                  </span>
                  {item.short}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={openMore}
              aria-haspopup="dialog"
              className={cn(
                "relative flex h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition",
                moreActive ? "text-brand-700" : "text-muted",
              )}
            >
              <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-brand-50")}>
                <Menu className="size-5" aria-hidden />
                <CountBadge count={moreCount} tone="amber" className="absolute -top-1 -right-0.5 ring-2 ring-white" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <Toaster />

      {/* ── Mobile "More" sheet ── */}
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMore();
        }}
        className="m-0 mt-auto w-full max-w-none bg-transparent p-0 backdrop:bg-brand-950/45 lg:hidden"
        aria-label="More"
      >
        <div className="pb-safe animate-sheet-up rounded-t-3xl bg-white px-4 pt-3 shadow-lift">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{admin.name}</p>
              <p className="truncate text-xs text-muted">{admin.email}</p>
            </div>
            <button
              type="button"
              onClick={closeMore}
              className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-mist"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <ul className="flex flex-col gap-0.5">
            {moreItems.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={closeMore}
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium",
                    active === item.key ? "bg-brand-50 text-brand-800" : "text-ink-soft active:bg-mist",
                  )}
                >
                  <item.icon className="size-5 text-brand-600" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  <CountBadge count={item.count} tone={item.tone} />
                </Link>
              </li>
            ))}
            <li className="my-1 border-t border-line" aria-hidden />
            <li>
              <a
                href="/"
                target="_blank"
                rel="noreferrer"
                className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-soft active:bg-mist"
              >
                <ArrowUpRight className="size-5 text-faint" aria-hidden />
                View site
              </a>
            </li>
            <li className="pb-2">{signOut}</li>
          </ul>
        </div>
      </dialog>
    </div>
  );
}
