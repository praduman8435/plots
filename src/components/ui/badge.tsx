import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        brand: "bg-brand-50 text-brand-800 ring-1 ring-brand-100",
        solid: "bg-brand-600 text-white",
        glass: "bg-white/90 text-ink shadow-soft backdrop-blur",
        neutral: "bg-mist text-ink-soft ring-1 ring-line",
        amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
        red: "bg-red-50 text-red-700 ring-1 ring-red-100",
        blue: "bg-sky-50 text-sky-800 ring-1 ring-sky-100",
        dark: "bg-brand-950/80 text-white backdrop-blur",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "brand", size: "md" },
  },
);

export function Badge({ className, tone, size, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}
