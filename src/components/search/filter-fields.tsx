import type { City } from "@/generated/prisma/client";
import type { LandType } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/field";
import { LAND_TYPES } from "@/lib/land";
import { AREA_UNITS } from "@/lib/units";
import type { SearchFilters } from "@/server/listings/queries";
import { LandTypeIcon } from "@/components/site/land-type-icon";

export const PRICE_STEPS = [
  2_00_000, 5_00_000, 10_00_000, 20_00_000, 30_00_000, 50_00_000, 75_00_000, 1_00_00_000, 2_00_00_000, 5_00_00_000,
];

function priceLabel(n: number) {
  return n >= 1_00_00_000 ? `₹${n / 1_00_00_000} Cr` : `₹${n / 1_00_000} Lakh`;
}

/** The filter controls. Rendered inside a plain GET form (sidebar on desktop, sheet on mobile). */
export function FilterFields({ f, cities, idPrefix }: { f: SearchFilters; cities: City[]; idPrefix: string }) {
  const id = (s: string) => `${idPrefix}-${s}`;
  return (
    <div className="space-y-6">
      {f.q && <input type="hidden" name="q" value={f.q} />}
      {f.sort !== "recommended" && <input type="hidden" name="sort" value={f.sort} />}

      {cities.length > 1 ? (
        <FilterGroup title="City" htmlFor={id("city")}>
          <Select id={id("city")} name="city" defaultValue={f.city ?? ""}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}, {c.state}
              </option>
            ))}
          </Select>
        </FilterGroup>
      ) : (
        cities[0] && <input type="hidden" name="city" value={cities[0].slug} />
      )}

      <fieldset>
        <legend className="mb-2.5 text-sm font-bold text-ink">Land type</legend>
        <div className="flex flex-wrap gap-2">
          <TypeOption value="" label="All types" checked={!f.type} />
          {(Object.keys(LAND_TYPES) as LandType[]).map((t) => (
            <TypeOption key={t} value={t} label={LAND_TYPES[t].short} checked={f.type === t} icon={<LandTypeIcon type={t} className="size-4" />} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-bold text-ink">Budget</legend>
        <div className="grid grid-cols-2 gap-2">
          <Select name="minPrice" aria-label="Minimum price" defaultValue={f.minPrice ?? ""}>
            <option value="">No min</option>
            {PRICE_STEPS.map((n) => (
              <option key={n} value={n}>
                {priceLabel(n)}
              </option>
            ))}
          </Select>
          <Select name="maxPrice" aria-label="Maximum price" defaultValue={f.maxPrice ?? ""}>
            <option value="">No max</option>
            {PRICE_STEPS.map((n) => (
              <option key={n} value={n}>
                {priceLabel(n)}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-bold text-ink">Land size</legend>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <input
            name="minArea"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="Min"
            aria-label="Minimum size"
            defaultValue={f.minArea ?? ""}
            className="h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-[16px] shadow-soft md:h-11 md:px-3.5 md:text-[15px] focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
          <input
            name="maxArea"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            placeholder="Max"
            aria-label="Maximum size"
            defaultValue={f.maxArea ?? ""}
            className="h-12 w-full rounded-xl border border-line-strong bg-white px-4 text-[16px] shadow-soft md:h-11 md:px-3.5 md:text-[15px] focus:border-brand-500 focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <div className="mt-2">
          <Select name="unit" aria-label="Size unit" defaultValue={f.areaUnit}>
            {Object.entries(AREA_UNITS).map(([key, u]) => (
              <option key={key} value={key}>
                in {u.label}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>
    </div>
  );
}

function FilterGroup({ title, htmlFor, children }: { title: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2.5 block text-sm font-bold text-ink">
        {title}
      </label>
      {children}
    </div>
  );
}

function TypeOption({ value, label, checked, icon }: { value: string; label: string; checked: boolean; icon?: React.ReactNode }) {
  return (
    <label className="cursor-pointer">
      <input type="radio" name="type" value={value} defaultChecked={checked} className="peer sr-only" />
      <span className="flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 text-sm font-semibold md:h-9 md:px-3 md:text-[13px] whitespace-nowrap text-ink-soft transition peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-800 peer-checked:ring-1 peer-checked:ring-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400">
        {icon}
        {label}
      </span>
    </label>
  );
}
