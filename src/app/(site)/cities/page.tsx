import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getCitiesWithCounts } from "@/server/listings/queries";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "Land for sale — all cities",
  description: "Browse land and plots for sale by city and town across India. Contact sellers directly on WhatsApp.",
};

export default async function CitiesPage() {
  const cities = await getCitiesWithCounts(300);
  const byState = new Map<string, typeof cities>();
  for (const c of cities) byState.set(c.state, [...(byState.get(c.state) ?? []), c]);
  const states = [...byState.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="container-page py-10 sm:py-16">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Land for sale by city</h1>
      <p className="mt-2 text-muted">
        {cities.length} {cities.length === 1 ? "city" : "cities"} with land available right now.
      </p>
      {states.length === 0 ? (
        <p className="mt-8 rounded-3xl bg-mist p-8 text-center text-muted ring-1 ring-line">
          No land listed yet. Be the first —{" "}
          <Link href="/sell" className="font-semibold text-brand-700">
            sell your land
          </Link>
          .
        </p>
      ) : (
        <div className="mt-8 space-y-9">
          {states.map(([state, list]) => (
            <section key={state}>
              <h2 className="text-sm font-bold tracking-wide text-muted uppercase">{state}</h2>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => (
                  <li key={c.id}>
                    <Link href={`/${c.slug}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-line transition hover:ring-brand-300">
                      <span className="flex min-w-0 items-center gap-2.5 font-semibold">
                        <MapPin className="size-4 shrink-0 text-brand-600" aria-hidden />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-muted">
                        {c.live} {c.live === 1 ? "plot" : "plots"}
                      </span>
                    </Link>
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
