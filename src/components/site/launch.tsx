import { ArrowRight, Award, Check } from "lucide-react";
import { BuyerRequestButton } from "@/components/site/buyer-request";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
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
    <div className={cn("relative isolate flex flex-col overflow-hidden rounded-[1.75rem] bg-brand-950 p-6 text-white sm:p-8", !compact && "lg:p-10")}>
      <div className="absolute -top-24 -right-24 -z-10 size-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-brand-200">
        <Award className="size-4" aria-hidden />
        <span className="tracking-wide uppercase">Founding sellers</span>
        <span aria-hidden className="text-white/30">·</span>
        <span className="text-white/70">{spotsLabel(spots)}</span>
      </p>
      <h2 className={cn("mt-3 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl", !compact && "lg:text-[2rem]")}>Have land to sell?</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-white/75">
        List it free. Our team checks every listing, and our first {spots.total} sellers get a Founding Seller badge and the top spot in search.
      </p>

      {counting && (
        <div className="mt-5 max-w-sm">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={spots.total} aria-valuenow={spots.taken} aria-label="Founding spots taken">
            <div className="h-full rounded-full bg-brand-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 sm:mt-auto sm:pt-7">
        <ButtonLink href={href} variant="white" size="md" className="h-12 w-full px-5 font-semibold sm:h-11 sm:w-auto">
          List your land free <ArrowRight />
        </ButtonLink>
      </div>
    </div>
  );
}

function BuyerCard({ demand, places }: { demand: BuyerDemand; places: string[] }) {
  const waiting = demand.buyers >= DEMAND_MIN_TO_SHOW ? demand.buyers : 0;
  return (
    <div className="flex flex-col rounded-[1.75rem] bg-brand-50 p-6 ring-1 ring-brand-100 sm:p-8 lg:p-10">
      <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase">Looking for land?</p>
      <h2 className="mt-3 text-2xl leading-tight font-extrabold tracking-tight text-ink sm:text-3xl lg:text-[2rem]">Tell us what you need.</h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">Share the place and your budget. We&apos;ll WhatsApp you when matching land is listed.</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-[13px] font-medium text-ink-soft">
        {["Free", "No login", "Your number stays private"].map((t) => (
          <li key={t} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-brand-100">
            <Check className="size-3.5 text-brand-600" aria-hidden /> {t}
          </li>
        ))}
      </ul>
      <div className="mt-6 sm:mt-auto sm:pt-7">
        <BuyerRequestButton places={places} size="md" className="h-12 w-full px-5 font-semibold sm:h-11 sm:w-auto">
          Get land alerts
        </BuyerRequestButton>
        {waiting > 0 && <p className="mt-3 text-sm text-muted">{waiting} buyers are already waiting.</p>}
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
