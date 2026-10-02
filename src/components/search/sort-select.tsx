"use client";

import { ArrowUpDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORTS, type SortKey } from "./sorts";

export function SortSelect({ value }: { value: SortKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white py-2 pr-3 pl-3 text-sm font-semibold text-ink-soft shadow-soft">
      <ArrowUpDown className="size-4 text-muted" aria-hidden />
      <span className="sr-only">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === "recommended") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          router.push(`${pathname}?${next}`);
        }}
        className="appearance-none bg-transparent pr-1 focus:outline-none"
      >
        {Object.entries(SORTS).map(([key, s]) => (
          <option key={key} value={key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
