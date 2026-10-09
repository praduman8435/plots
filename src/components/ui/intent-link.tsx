"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A Link that prefetches on intent (finger down, hover, keyboard focus)
 * instead of when it scrolls into view. Lists of plot cards, city tiles and the
 * footer would otherwise prefetch dozens of pages while the visitor scrolls —
 * on a slow mobile connection that bandwidth is better spent on photos. A
 * touch lands ~100 ms before the tap completes, which is enough to get ahead.
 */
export function IntentLink({ href, onPointerEnter, onTouchStart, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      {...props}
    />
  );
}
