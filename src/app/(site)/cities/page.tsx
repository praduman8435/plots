import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { IntentLink } from "@/components/ui/intent-link";
import { getCitiesWithCounts } from "@/server/listings/queries";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Land and plots for sale by city",
  description: "Browse land and plots for sale by city and town across India. Contact sellers directly on WhatsApp.",
};

export default async function CitiesPage() {
  const cities = await getCitiesWithCounts(300);
  const byState = new Map<string, typeof cities>();
  for (const c of cities) byState.set(c.state, [...(byState.get(c.state) ?? []), c]);
  const states = [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="container-page py-10 sm:py-14 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-14">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <h1 className="text-3xl font-extrabold sm:text-[2rem] lg:text-[1.75rem]">Land for sale by city</h1>
        <p className="mt-2 text-muted">
          {cities.length > 0 ? `${cities.length} ${cities.length === 1 ? "city" : "cities"} with land available right now.` : "Land is being added city by city."}
        </p>
        <div className="mt-4 hidden flex-col gap-2 text-sm font-semibold lg:flex">
          <Link href="/search" className="text-brand-700 hover:text-brand-800">
            Search all land →
          </Link>
          <Link href="/sell" className="text-muted hover:text-ink">
            Selling in a city not listed here? List your land →
          </Link>
        </div>
      </div>
      {states.length === 0 ? (
        <p className="mt-8 rounded-3xl bg-mist p-8 text-center text-muted ring-1 ring-line lg:mt-0">
          No land listed yet. Be the first —{" "}
          <Link href="/sell" className="font-semibold text-brand-700">
            sell your land
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:mt-1 xl:grid-cols-3">
          {states.map(([state, list]) => (
            <section key={state}>
              <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{state}</h2>
              <ul className="mt-3 grid gap-2">
                {list.map((c) => (
                  <li key={c.id}>
                    <IntentLink href={`/${c.slug}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-line transition hover:bg-brand-50/40 hover:ring-brand-300 md:rounded-xl md:px-4 md:py-3">
                      <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                        <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted">
                        {c.live} {c.live === 1 ? "plot" : "plots"}
                      </span>
                    </IntentLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
