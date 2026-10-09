"use client";

import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Img = { url: string; width: number | null; height: number | null };

/** Swipeable full-bleed gallery on phones; mosaic + lightbox on desktop. */
export function Gallery({ images, title, overlay }: { images: Img[]; title: string; overlay?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const lightbox = useRef<HTMLDialogElement>(null);
  const lbTrack = useRef<HTMLDivElement>(null);

  function openAt(i: number) {
    lightbox.current?.showModal();
    requestAnimationFrame(() => lbTrack.current?.scrollTo({ left: i * (lbTrack.current?.clientWidth ?? 0) }));
  }

  function step(dir: 1 | -1) {
    const t = lbTrack.current;
    if (t) t.scrollBy({ left: dir * t.clientWidth, behavior: "smooth" });
  }

  if (images.length === 0) {
    return <div className="flex aspect-[4/3] items-center justify-center bg-mist text-muted md:rounded-3xl">No photos yet</div>;
  }

  return (
    <>
      {/* Phone: swipe */}
      <div className="relative md:hidden">
        <div
          ref={track}
          className="no-scrollbar flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto bg-mist"
          onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {images.map((img, i) => (
            <button key={img.url + i} type="button" onClick={() => openAt(i)} className="relative h-full w-full shrink-0 snap-center" aria-label={`Open photo ${i + 1}`}>
              <Image src={img.url} alt={`${title} — photo ${i + 1}`} fill loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} sizes="100vw" className="object-cover" />
            </button>
          ))}
        </div>
        {overlay}
        {images.length > 1 && (
          <>
            <span className="absolute right-4 bottom-10 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
              {index + 1} / {images.length}
            </span>
            <div className="absolute inset-x-0 bottom-10 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <span key={i} className={cn("h-1.5 rounded-full bg-white transition-all", i === index ? "w-5" : "w-1.5 opacity-60")} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop: mosaic */}
      <div className="relative hidden h-[460px] gap-2 overflow-hidden rounded-3xl md:grid md:grid-cols-4 md:grid-rows-2">
        {images.slice(0, 3).map((img, i) => (
          <button
            key={img.url + i}
            type="button"
            onClick={() => openAt(i)}
            className={cn("group relative overflow-hidden bg-mist", i === 0 ? "col-span-3 row-span-2" : "col-span-1 row-span-1", images.length === 1 && "col-span-4", images.length === 2 && i === 1 && "row-span-2")}
          >
            <Image src={img.url} alt={`${title} — photo ${i + 1}`} fill loading="lazy" fetchPriority={i === 0 ? "high" : "auto"} sizes={i === 0 ? "60vw" : "20vw"} className="object-cover transition duration-500 group-hover:scale-[1.03]" />
          </button>
        ))}
        <button
          type="button"
          onClick={() => openAt(0)}
          className="absolute right-4 bottom-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-ink shadow-card backdrop-blur hover:bg-white"
        >
          <Expand className="size-4" aria-hidden /> View {images.length} photo{images.length > 1 ? "s" : ""}
        </button>
      </div>

      {/* Lightbox */}
      <dialog
        ref={lightbox}
        aria-label="Photos"
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white open:flex open:flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <p className="truncate text-sm font-medium text-white/80">{title}</p>
          <button type="button" onClick={() => lightbox.current?.close()} className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close photos">
            <X className="size-6" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <div ref={lbTrack} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto">
            {images.map((img, i) => (
              <div key={img.url + i} className="relative h-full w-full shrink-0 snap-center">
                <Image src={img.url} alt={`${title} — photo ${i + 1}`} fill sizes="100vw" className="object-contain" />
              </div>
            ))}
          </div>
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} className="absolute top-1/2 left-3 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex" aria-label="Previous photo">
                <ChevronLeft className="size-6" />
              </button>
              <button type="button" onClick={() => step(1)} className="absolute top-1/2 right-3 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex" aria-label="Next photo">
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
