import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { WhatsAppIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { LAND_TYPES } from "@/lib/land";
import { getCitiesWithCounts } from "@/server/listings/queries";
import { site } from "@/lib/site";
import { isWhatsAppConnected, sellOnWhatsAppLink, supportWhatsAppLink } from "@/lib/whatsapp-links";

export async function SiteFooter() {
  const topCities = await getCitiesWithCounts(5);
  const columns = [
    {
      title: "Buy land",
      links: [
        { href: "/search", label: "All plots" },
        ...topCities.map((c) => ({ href: `/${c.slug}`, label: `Land in ${c.name}` })),
        { href: "/cities", label: "All cities" },
        ...Object.entries(LAND_TYPES)
          .filter(([key]) => key !== "OTHER")
          .map(([key, t]) => ({ href: `/search?type=${key}`, label: t.label })),
      ],
    },
    {
      title: "Sell land",
      links: [
        { href: "/sell", label: "How selling works" },
        { href: sellOnWhatsAppLink(), label: "List on WhatsApp", external: isWhatsAppConnected() },
        { href: "/seller", label: "Seller login" },
      ],
    },
  ];

  return (
    <footer className="bg-contours relative mt-auto overflow-hidden bg-brand-950 text-white/80">
      <div className="container-page grid gap-10 pt-14 pb-28 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] md:pb-14">
        <div>
          <Logo inverted />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65">
            A land-only marketplace. Find plots near you and talk to owners and brokers directly — no login, no fees for buyers.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="text-sm font-semibold text-white">{col.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  {"external" in l && l.external ? (
                    <a href={l.href} target="_blank" rel="noopener" className="transition hover:text-white">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="transition hover:text-white">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="text-sm font-semibold text-white">Need help?</h3>
          <a
            href={supportWhatsAppLink()}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <WhatsAppIcon className="size-4" /> Chat with us
          </a>
          <p className="mt-5 flex gap-2 text-xs leading-relaxed text-white/55">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            {site.disclaimer}
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-1 py-5 text-xs text-white/45 sm:flex-row sm:justify-between md:pb-5">
          <p>© {new Date().getFullYear()} {site.name}. Made for India&apos;s land buyers.</p>
          <p>Seed photos: Wikimedia Commons contributors (CC licences)</p>
        </div>
      </div>
    </footer>
  );
}
