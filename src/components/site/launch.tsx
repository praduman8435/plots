import { ArrowRight, Award, BadgeCheck, Check, TrendingUp } from "lucide-react";
import { BuyerRequestButton } from "@/components/site/buyer-request";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import type { BuyerDemand } from "@/server/buyer-requests";
import { DEMAND_MIN_TO_SHOW } from "@/server/buyer-requests";

type Spots = { taken: number; left: number; total: number };

/** Below this many claimed, the card shows no count: "100 of 100 left" reads as an empty shop. */
const SHOW_COUNT_FROM = 10;

/** The short line about spots: a live count once it says something, "first 100 only" before. */
export function spotsLabel(spots: Spots): string {
  return spots.taken >= SHOW_COUNT_FROM ? `${spots.left} of ${spots.total} spots left` : `First ${spots.total} sellers only`;
}

/**
 * The two invitations of a young marketplace, side by side: sellers, take one
 * of the founding spots; buyers, tell us what you need. Every number on it is
 * counted from the database.
 */
export function LaunchSection({ spots, demand, places, className }: { spots: Spots; demand: BuyerDemand; places: string[]; className?: string }) {
  return (
    <section className={cn("container-page", className)}>
      <div className={cn("grid gap-4 sm:gap-5", spots.left > 0 && "lg:grid-cols-[1.15fr_1fr]")}>
        {spots.left > 0 && <FoundingCard spots={spots} />}
        <BuyerCard demand={demand} places={places} />
      </div>
    </section>
  );
}

export function FoundingCard({ spots, compact = false, href = "/sell" }: { spots: Spots; compact?: boolean; href?: string }) {
  const counting = spots.taken >= SHOW_COUNT_FROM;
  const pct = Math.round((spots.taken / spots.total) * 100);
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[2rem] bg-brand-950 text-white", compact ? "p-6 sm:p-7" : "p-7 sm:p-10")}>
      <div className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-brand-200 uppercase">
          <Award className="size-3.5" aria-hidden /> Founding sellers
        </span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
          {spotsLabel(spots)}
        </span>
      </div>
      <h2 className={cn("mt-3 font-extrabold tracking-tight", compact ? "text-2xl" : "text-[1.75rem] leading-tight sm:text-4xl")}>
        Have land to sell? Be one of our first {spots.total}.
      </h2>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/80 sm:text-base">
        Every listing on {site.name} is checked by our team before buyers see it. Our first {spots.total} sellers get the{" "}
        <b className="font-semibold text-white">Founding Seller</b> badge, so buyers know they were here from the start, and their land is shown first.
      </p>

      <ul className="mt-5 grid max-w-xl gap-2 text-sm text-white/85 sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <BadgeCheck className="size-4 shrink-0 text-brand-300" aria-hidden /> Free to list, checked before it goes live
        </li>
        <li className="flex items-center gap-2">
          <TrendingUp className="size-4 shrink-0 text-brand-300" aria-hidden /> Founding Seller badge, shown first
        </li>
      </ul>

      <div className="mt-6 max-w-xl">
        {counting && (
          <div className="mb-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={spots.total} aria-valuenow={spots.taken} aria-label="Founding spots taken">
            <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-200" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-xs text-white/60">Your spot is confirmed when your first listing goes live.</p>
      </div>

      <ButtonLink href={href} variant="white" size="lg" className="mt-6 w-full sm:w-auto">
        List your land free <ArrowRight />
      </ButtonLink>
    </div>
  );
}

function BuyerCard({ demand, places }: { demand: BuyerDemand; places: string[] }) {
  const waiting = demand.buyers >= DEMAND_MIN_TO_SHOW ? demand.buyers : 0;
  return (
    <div className="flex flex-col rounded-[2rem] bg-brand-50 p-7 ring-1 ring-brand-100 sm:p-10">
      <p className="text-xs font-bold tracking-widest text-brand-700 uppercase">Looking for land?</p>
      <h2 className="mt-3 text-[1.75rem] leading-tight font-extrabold tracking-tight text-ink sm:text-4xl">Tell us what you need.</h2>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-ink-soft sm:text-base">
        Where, what kind, and your budget. We&apos;ll WhatsApp you as soon as matching land is listed. No login, no fee.
      </p>
      <ul className="mt-5 grid gap-2 text-sm text-ink-soft">
        {["Any city, town or village", "Farmland, house plots or shop land", "Only our team sees your number"].map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-brand-600" aria-hidden /> {t}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-7">
        <BuyerRequestButton places={places} className="w-full sm:w-auto" />
        {waiting > 0 && <p className="mt-3 text-sm text-muted">Join {waiting} buyers already waiting for land.</p>}
      </div>
    </div>
  );
}

/** For /sell: real buyer requests, so a seller sees people are already asking. Hidden until there are a few. */
export function DemandCard({ demand }: { demand: BuyerDemand }) {
  if (demand.buyers < DEMAND_MIN_TO_SHOW) return null;
  return (
    <div className="rounded-[2rem] bg-brand-50 p-6 ring-1 ring-brand-100 sm:p-7">
      <p className="text-xs font-bold tracking-widest text-brand-700 uppercase">Buyers are waiting</p>
      <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">{demand.buyers} buyers have asked us for land.</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">They told us where they want it and their budget. List yours, and we&apos;ll tell the ones looking in your area.</p>
      {demand.places.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-2">
          {demand.places.map((p) => (
            <li key={p.name} className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-line">
              {p.name} <span className="font-normal text-muted">· {p.buyers} buyers</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
