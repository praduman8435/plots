"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

/** Mobile bottom sheet that holds the (server-rendered) filter form. */
export function FilterSheet({ activeCount, children, resetHref }: { activeCount: number; children: React.ReactNode; resetHref: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" variant="secondary" size="md" onClick={() => ref.current?.showModal()} className="shrink-0 px-4">
        <SlidersHorizontal />
        Filters
        {activeCount > 0 && (
          <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{activeCount}</span>
        )}
      </Button>
      <dialog
        ref={ref}
        aria-label="Filters"
        className="m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col open:flex rounded-t-[1.75rem] bg-white p-0 shadow-lift open:animate-sheet-up"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <form action="/search" method="get" className="flex min-h-0 flex-1 flex-col" onSubmit={() => ref.current?.close()}>
          <div className="flex items-center justify-between border-b border-line px-5 pt-3 pb-3">
            <div className="w-10" />
            <div className="flex flex-col items-center">
              <span className="mb-2 h-1.5 w-10 rounded-full bg-line-strong" aria-hidden />
              <h2 className="text-base font-bold">Filters</h2>
            </div>
            <button type="button" onClick={() => ref.current?.close()} className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-mist" aria-label="Close filters">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">{children}</div>
          <div className="pb-safe flex gap-3 border-t border-line bg-white px-5 pt-3">
            <a href={resetHref} className="flex h-12 flex-1 items-center justify-center rounded-full text-[15px] font-semibold text-ink-soft hover:bg-mist">
              Reset
            </a>
            <Button type="submit" size="lg" className="flex-[2]">
              Show plots
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
