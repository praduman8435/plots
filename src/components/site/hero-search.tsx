import { IndianRupee, LandPlot, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LAND_TYPES } from "@/lib/land";

const BUDGETS = [
  { value: "1000000", label: "Up to ₹10 Lakh" },
  { value: "2500000", label: "Up to ₹25 Lakh" },
  { value: "5000000", label: "Up to ₹50 Lakh" },
  { value: "10000000", label: "Up to ₹1 Cr" },
  { value: "50000000", label: "Up to ₹5 Cr" },
];

/** Plain GET form → /search. Works before JavaScript loads (slow 3G). */
export function HeroSearch({ citySlug, compact = false }: { citySlug?: string; compact?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className="rounded-3xl bg-white p-2 shadow-lift ring-1 ring-black/5 md:rounded-2xl md:p-1.5">
      {citySlug && <input type="hidden" name="city" value={citySlug} />}
      <div className={compact ? "grid gap-1 sm:grid-cols-[1.5fr_1fr_auto]" : "grid gap-1 md:grid-cols-[1.5fr_1.1fr_1fr_auto]"}>
        <SearchField icon={<MapPin className="size-5 text-brand-600" aria-hidden />} label="Where do you want land?" htmlFor="hs-q">
          <input
            id="hs-q"
            name="q"
            placeholder="Village, area or landmark"
            autoComplete="off"
            enterKeyHint="search"
            className="w-full min-w-0 bg-transparent text-[16px] font-medium text-ink placeholder:font-normal placeholder:text-faint focus:outline-none"
          />
        </SearchField>
        <SearchField icon={<LandPlot className="size-5 text-brand-600" aria-hidden />} label="What are you looking for?" htmlFor="hs-type">
          <select id="hs-type" name="type" defaultValue="" className="w-full min-w-0 appearance-none bg-transparent text-[16px] font-medium text-ink focus:outline-none">
            <option value="">Any land</option>
            {Object.entries(LAND_TYPES)
              .filter(([k]) => k !== "OTHER")
              .map(([key, t]) => (
                <option key={key} value={key}>
                  {t.label}
                </option>
              ))}
          </select>
        </SearchField>
        {!compact && (
          <SearchField icon={<IndianRupee className="size-5 text-brand-600" aria-hidden />} label="Budget" htmlFor="hs-budget">
            <select id="hs-budget" name="maxPrice" defaultValue="" className="w-full min-w-0 appearance-none bg-transparent text-[16px] font-medium text-ink focus:outline-none">
              <option value="">Any budget</option>
              {BUDGETS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </SearchField>
        )}
        <Button type="submit" size="xl" className="mt-1 h-14 w-full rounded-2xl md:mt-0 md:h-auto md:min-h-14 md:w-auto md:rounded-xl md:px-6">
          <Search /> Search land
        </Button>
      </div>
    </form>
  );
}

function SearchField({ icon, label, htmlFor, children }: { icon: React.ReactNode; label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-2xl px-4 py-2 transition focus-within:bg-mist hover:bg-mist/70 md:min-h-14 md:rounded-xl md:px-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block truncate text-xs font-semibold text-muted">
          {label}
        </label>
        {children}
      </div>
    </div>
  );
}
