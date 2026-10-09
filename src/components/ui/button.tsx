import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all duration-200 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white shadow-brand hover:bg-brand-700",
        dark: "bg-brand-950 text-white hover:bg-brand-900",
        whatsapp: "bg-brand-600 text-white shadow-brand hover:bg-brand-700",
        secondary: "border border-line-strong bg-white text-ink shadow-soft hover:border-brand-300 hover:bg-brand-50/40",
        soft: "bg-brand-50 text-brand-800 hover:bg-brand-100",
        ghost: "text-ink-soft hover:bg-brand-50 hover:text-brand-800",
        white: "bg-white text-brand-900 shadow-soft hover:bg-brand-50",
        danger: "border border-red-200 bg-white text-danger hover:bg-red-50",
        link: "rounded-none px-0 text-brand-700 underline-offset-4 hover:underline",
      },
      size: {
        // Phones keep generous touch targets; from md (tablet/desktop, pointer) sizes step down one notch.
        sm: "h-9 px-3.5 text-sm [&_svg]:size-4",
        md: "h-11 px-5 text-[15px] md:h-10 md:px-4 md:text-sm [&_svg]:size-[18px] md:[&_svg]:size-4",
        lg: "h-12 px-6 text-base md:h-11 md:px-5 md:text-[15px] [&_svg]:size-5 md:[&_svg]:size-[18px]",
        xl: "h-14 px-7 text-base md:h-12 md:px-6 [&_svg]:size-5",
        icon: "size-11 md:size-10 [&_svg]:size-5",
        "icon-sm": "size-9 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & ButtonVariantProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }: ComponentProps<typeof Link> & ButtonVariantProps) {
  return <Link className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonA({ className, variant, size, ...props }: ComponentProps<"a"> & ButtonVariantProps) {
  return <a className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
