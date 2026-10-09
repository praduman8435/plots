import { ArrowRight, BadgeCheck, CircleDollarSign, FileSearch, LocateFixed, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { IntentLink } from "@/components/ui/intent-link";
import { WhatsAppIcon } from "@/components/ui/icons";
import { LAND_TYPES, LAND_TYPE_SLUGS } from "@/lib/land";
import type { PropertyCardData } from "@/server/listings/queries";
import { PropertyCard } from "@/components/listing/property-card";
import { LandTypeIcon } from "./land-type-icon";
import type { LandType } from "@/generated/prisma/enums";

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <div>
        {eyebrow && <p className="mb-2 text-xs font-bold tracking-[0.14em] text-brand-600 uppercase">{eyebrow}</p>}
        <h2 className="text-[1.6rem] leading-tight font-extrabold text-ink sm:text-[1.75rem]">{title}</h2>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted sm:text-base">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function LandTypeTiles({ counts, citySlug }: { counts: Partial<Record<LandType, number>>; citySlug?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {(Object.keys(LAND_TYPES) as LandType[]).filter((t) => t !== "OTHER").map((type) => {
        const count = counts[type] ?? 0;
        const href = citySlug ? `/${citySlug}/${LAND_TYPE_SLUGS[type]}` : `/search?type=${type}`;
        return (
          <IntentLink
            key={type}
            href={href}
            className="group relative overflow-hidden rounded-3xl border border-line bg-white p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card sm:p-6"
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition group-hover:bg-brand-600 group-hover:text-white sm:size-12">
              <LandTypeIcon type={type} className="size-5 sm:size-6" />
            </span>
            <p className="mt-4 text-[15px] leading-snug font-bold text-ink sm:text-lg">{LAND_TYPES[type].label}</p>
            <p className="mt-0.5 text-sm text-muted">
              {count} {count === 1 ? "plot" : "plots"} available
            </p>
            <ArrowRight className="absolute top-5 right-5 size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
          </IntentLink>
        );
      })}
    </div>
  );
}

/** Horizontal snap carousel on phones, grid on desktop. */
export function ListingRail({ items }: { items: PropertyCardData[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {items.map((p) => (
        <PropertyCard
          key={p.id}
          p={p}
          className="w-[84%] shrink-0 snap-start sm:w-auto"
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 84vw"
        />
      ))}
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    { icon: Search, title: "Search near you", text: "Filter by village, land type, budget and size — in bigha, acre, gaj or sq ft." },
    { icon: FileSearch, title: "Check the details", text: "Real photos, price per unit, approximate location and what the seller says about the land." },
    { icon: MessageCircle, title: "WhatsApp the seller", text: "One tap opens a chat with the seller. No login, and no fee from us — ever." },
  ];
  return (
    <ol className="grid gap-3 sm:gap-4 md:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="relative rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand">
              <s.icon className="size-5" aria-hidden />
            </span>
            <span className="text-xs font-bold tracking-widest text-faint">STEP {i + 1}</span>
          </div>
          <h3 className="mt-4 text-lg font-bold text-ink">{s.title}</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** A quiet one-line pointer for sellers on buyer pages — the full story lives on /sell. */
export function SellerNudge({ place }: { place?: string }) {
  return (
    <IntentLink
      href="/sell"
      className="group flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line transition hover:ring-brand-300 sm:p-5"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <WhatsAppIcon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink">Have land{place ? ` in ${place}` : ""} to sell?</span>
        <span className="block text-sm text-muted">List it free on WhatsApp or here — buyers call you directly.</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-brand-700 transition group-hover:translate-x-0.5" aria-hidden />
    </IntentLink>
  );
}

export function TrustGrid() {
  const items = [
    { icon: BadgeCheck, title: "Phone-verified sellers", text: "Every seller confirms their WhatsApp number before a plot goes live." },
    { icon: LocateFixed, title: "Location shown approximately", text: "We show the area, not the exact plot — protecting sellers until you talk." },
    { icon: CircleDollarSign, title: "We never take buyer money", text: "No tokens, no advance through us. Deal directly and pay only after checking papers." },
    { icon: ShieldCheck, title: "Check the documents", text: "We verify the seller's phone and identity (Aadhaar), not land ownership. Always see khatauni and registry first." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
          <it.icon className="size-6 text-brand-600" aria-hidden />
          <h3 className="mt-3.5 font-bold text-ink">{it.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{it.text}</p>
        </div>
      ))}
    </div>
  );
}

/** Buyers: Search → Explore → Contact. Sellers: List → Get discovered → Connect. */
export function HowItWorksBoth() {
  const lanes = [
    {
      who: "Looking for land",
      steps: [
        { title: "Tell us where", text: "Pick a place, the kind of land and your budget." },
        { title: "See it honestly", text: "Real photos, the price, the size, and the area on a map." },
        { title: "Talk to the seller", text: "Call or WhatsApp directly. Visit, check the papers, decide at your own pace." },
      ],
    },
    {
      who: "Selling land",
      steps: [
        { title: "List in minutes", text: "On WhatsApp or here — in Hindi or English, in a few simple steps." },
        { title: "We check, then it goes live", text: "Our team reviews every listing, so buyers can trust what they see." },
        { title: "Buyers call you", text: "People looking for land in your area contact you directly." },
      ],
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lanes.map((lane) => (
        <div key={lane.who} className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-7">
          <p className="text-sm font-bold text-brand-700">{lane.who}</p>
          <ol className="mt-4 space-y-4">
            {lane.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3.5">
                <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700 ring-1 ring-brand-100">{i + 1}</span>
                <div>
                  <p className="font-bold text-ink">{s.title}</p>
                  <p className="text-[15px] text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Four short reasons — no marketing fluff. */
export function WhyUs() {
  const items = [
    { icon: Search, title: "Land near you", text: "Search by village, town or road — in bigha, acre, gaj or sq ft." },
    { icon: MessageCircle, title: "Straight to the seller", text: "Call or WhatsApp. No login, no fee for buyers, nobody in between." },
    { icon: BadgeCheck, title: "Only land that's really available", text: "Sellers keep their listings up to date, and sold land comes off. What you see is what's for sale." },
    { icon: ShieldCheck, title: "Checked before it's live", text: "Our team reviews every listing. Every seller's phone is verified." },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="flex gap-3.5 rounded-3xl bg-white p-5 ring-1 ring-line lg:flex-col">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><it.icon className="size-5" aria-hidden /></span>
          <div>
            <h3 className="font-bold text-ink">{it.title}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-muted">{it.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
