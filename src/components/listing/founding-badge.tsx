import { Award } from "lucide-react";

/** "Founding Seller #12": one of the first sellers on InstaPlots (src/server/founding.ts). */
export function FoundingBadge({ number }: { number: number | null }) {
  return (
    <li
      className="inline-flex items-center gap-1.5 rounded-full bg-brand-950 px-2.5 py-1 text-white ring-1 ring-brand-900"
      title="One of the first sellers on InstaPlots"
    >
      <Award className="size-3.5 text-brand-200" aria-hidden /> Founding Seller{number ? ` #${number}` : ""}
    </li>
  );
}
