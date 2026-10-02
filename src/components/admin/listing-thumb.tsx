import { ImageOff } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/cn";

/** Cover photo (or a calm placeholder) for admin cards and rows. */
export function ListingThumb({
  url,
  alt,
  sizes,
  className,
  count,
}: {
  url?: string | null;
  alt: string;
  sizes: string;
  className?: string;
  count?: number;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-mist", className)}>
      {url ? (
        <Image src={url} alt={alt} fill sizes={sizes} className="object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-faint">
          <ImageOff className="size-5" aria-hidden />
          <span className="text-[11px] font-medium">No photos</span>
        </div>
      )}
      {count != null && count > 1 && (
        <span className="absolute right-2 bottom-2 rounded-full bg-brand-950/75 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
          {count} photos
        </span>
      )}
    </div>
  );
}
