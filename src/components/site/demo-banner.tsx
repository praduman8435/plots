import { isDemoMode } from "@/lib/demo";

/** Honest label for the public demo: sample data and simulated checks. */
export function DemoBanner() {
  if (!isDemoMode()) return null;
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950">
      Demo site — sample listings. Phone codes and identity checks are simulated.
    </div>
  );
}
