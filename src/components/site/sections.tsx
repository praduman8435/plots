import { ArrowRight, BadgeCheck, CircleDollarSign, FileSearch, LocateFixed, MessageCircle, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ButtonA, ButtonLink } from "@/components/ui/button";
import { WhatsAppIcon } from "@/components/ui/icons";
import { LAND_TYPES, LAND_TYPE_SLUGS } from "@/lib/land";
import { site } from "@/lib/site";
import { sellOnWhatsAppLink } from "@/lib/whatsapp-links";
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
        <h2 className="text-[1.6rem] leading-tight font-extrabold text-ink sm:text-[2rem]">{title}</h2>
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
          <Link
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
          </Link>
        );
      })}
    </div>
  );
}

/** Horizontal snap carousel on phones, grid on desktop. */
export function ListingRail({ items }: { items: PropertyCardData[] }) {
  return (
    <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {items.map((p, i) => (
        <PropertyCard
          key={p.id}
          p={p}
          priority={i < 2}
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
    { icon: MessageCircle, title: "WhatsApp the seller", text: "One tap opens a chat with the owner or broker. No login, no middle-man fees from us." },
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

/** Green band with a live-looking WhatsApp chat — the seller pitch. */
export function SellOnWhatsAppBand() {
  return (
    <div className="relative isolate overflow-hidden rounded-[2rem] bg-linear-to-br from-brand-800 via-brand-700 to-brand-600 px-5 py-10 text-white shadow-lift sm:px-10 sm:py-14 lg:px-14">
      <div className="bg-contours absolute inset-0 -z-10" aria-hidden />
      <div className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-brand-400/30 blur-3xl" aria-hidden />
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
            <WhatsAppIcon className="size-3.5" /> For owners &amp; brokers
          </p>
          <h2 className="mt-4 text-[1.9rem] leading-[1.1] font-extrabold sm:text-[2.6rem]">
            List your land in 3 minutes — right from WhatsApp.
          </h2>
          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/80 sm:text-base">
            Send us a message, answer a few simple questions and share photos. We verify your listing and publish it. You get a
            permanent <strong className="text-white">Seller ID</strong> to track your plots and enquiries.
          </p>
          <ul className="mt-6 grid gap-2.5 text-[15px] text-white/90">
            {["No documents needed to list", "Buyers contact you directly", "Free to list while we launch"].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <BadgeCheck className="size-5 text-brand-200" aria-hidden /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonA href={sellOnWhatsAppLink()} target="_blank" rel="noopener" variant="white" size="xl">
              <WhatsAppIcon className="text-brand-600" /> List on WhatsApp
            </ButtonA>
            <ButtonLink href="/sell" size="xl" className="bg-white/10 shadow-none ring-1 ring-white/25 hover:bg-white/15">
              How it works <ArrowRight />
            </ButtonLink>
          </div>
        </div>
        <ChatMockup />
      </div>
    </div>
  );
}

function ChatMockup() {
  const bubbles: { from: "me" | "bot"; text: string; buttons?: string[] }[] = [
    { from: "me", text: "SELL — Hi, I want to list my land" },
    { from: "bot", text: "Namaste 🙏 What type of land is it?", buttons: ["Agricultural", "Residential"] },
    { from: "me", text: "Agricultural, 2 bigha in Sathiyaon" },
    { from: "bot", text: "Great! What price do you expect?" },
    { from: "me", text: "18 lakh" },
    { from: "bot", text: "✅ Received! We'll verify and publish it.\nYour Seller ID: SLR-7A41K2" },
  ];
  return (
    <div className="mx-auto w-full max-w-[22rem]" aria-hidden>
      <div className="rounded-[2.4rem] bg-brand-950 p-2.5 shadow-lift ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[1.9rem] bg-[#efeae2]">
          <div className="flex items-center gap-3 bg-brand-800 px-4 py-3 text-white">
            <span className="flex size-9 items-center justify-center rounded-full bg-white/15 text-sm font-bold">P</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">{site.name} Assistant</p>
              <p className="text-[11px] text-white/70">online</p>
            </div>
          </div>
          <div className="space-y-2 px-3 py-4 text-[13px] leading-snug">
            {bubbles.map((b, i) => (
              <div key={i} className={b.from === "me" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    b.from === "me"
                      ? "max-w-[80%] rounded-2xl rounded-tr-md bg-[#d9fdd3] px-3 py-2 text-ink shadow-sm"
                      : "max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3 py-2 text-ink shadow-sm"
                  }
                >
                  <p className="whitespace-pre-line">{b.text}</p>
                  {b.buttons && (
                    <div className="mt-2 grid gap-1 border-t border-line pt-1.5">
                      {b.buttons.map((t) => (
                        <span key={t} className="text-center text-[12.5px] font-semibold text-sky-600">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrustGrid() {
  const items = [
    { icon: BadgeCheck, title: "Phone-verified sellers", text: "Every seller confirms their WhatsApp number before a plot goes live." },
    { icon: LocateFixed, title: "Location shown approximately", text: "We show the area, not the exact plot — protecting owners until you talk." },
    { icon: CircleDollarSign, title: "We never take buyer money", text: "No tokens, no advance through us. Deal directly and pay only after checking papers." },
    { icon: ShieldCheck, title: "Check the documents", text: "We verify the seller's phone, not ownership. Always see khatauni and registry first." },
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
      who: "Buying land",
      steps: [
        { title: "Search", text: "Pick a place, type of land and your budget." },
        { title: "Explore", text: "See photos, price, size and the area on a map." },
        { title: "Contact", text: "WhatsApp or call the seller directly." },
      ],
    },
    {
      who: "Selling land",
      steps: [
        { title: "List", text: "Add your land in a few minutes — on the website or WhatsApp." },
        { title: "Get discovered", text: "Buyers searching your area find it." },
        { title: "Connect", text: "Interested buyers contact you directly." },
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
    { icon: Search, title: "Search by location", text: "Land near the village, town or road you care about." },
    { icon: MessageCircle, title: "Talk directly to sellers", text: "WhatsApp or call. No login, no fee for buyers." },
    { icon: BadgeCheck, title: "Fresh availability", text: "Sellers confirm every week that their land is still available." },
    { icon: ShieldCheck, title: "Verified sellers", text: "Phone verified, and identity verified where shown." },
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
