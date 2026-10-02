import { Factory, Home, LandPlot, Store, Wheat, type LucideProps } from "lucide-react";
import type { LandType } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

const ICONS = { AGRICULTURAL: Wheat, RESIDENTIAL_PLOT: Home, COMMERCIAL: Store, INDUSTRIAL: Factory, OTHER: LandPlot } as const;

export function LandTypeIcon({ type, className, ...props }: { type: LandType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon aria-hidden className={cn("shrink-0", className)} {...props} />;
}
