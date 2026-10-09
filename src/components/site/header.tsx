import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const nav = [
  { href: "/search", label: "Search land" },
  { href: "/cities", label: "All cities" },
  { href: "/seller", label: "Seller login" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/95 md:bg-white/75 md:backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition hover:bg-brand-50 hover:text-brand-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/sell" size="sm" className="hidden shadow-none md:inline-flex">
            Sell your land
          </ButtonLink>
          <ButtonLink href="/sell" variant="soft" size="sm" className="md:hidden">
            Sell land
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
