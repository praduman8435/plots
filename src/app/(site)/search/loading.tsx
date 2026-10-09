/**
 * Shown instantly while search results load (the page is rendered per
 * request). Same shapes as the real page — search bar, type chips, cards — so
 * nothing jumps when results arrive.
 */
export default function SearchLoading() {
  return (
    <div className="pb-24 md:pb-16" aria-busy="true" aria-label="Loading results">
      <div className="sticky top-16 z-30 border-b border-line bg-white/95 lg:top-[72px]">
        <div className="container-page flex items-center gap-2.5 py-3">
          <div className="h-11 flex-1 rounded-full bg-mist ring-1 ring-line" />
          <div className="size-11 rounded-full bg-mist ring-1 ring-line lg:hidden" />
        </div>
        <div className="container-page flex gap-1.5 overflow-hidden pb-3 lg:hidden">
          {[64, 92, 112, 104].map((w) => (
            <div key={w} className="h-9 shrink-0 rounded-full bg-mist ring-1 ring-line" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="container-page mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[18rem_1fr]">
        <div className="hidden h-96 rounded-3xl border border-line bg-white lg:block" />
        <div>
          <div className="h-7 w-48 animate-pulse rounded-lg bg-mist" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
                <div className="aspect-[4/3] animate-pulse bg-mist" />
                <div className="space-y-2.5 p-4 sm:p-5">
                  <div className="h-6 w-28 rounded-lg bg-mist" />
                  <div className="h-4 w-44 rounded bg-mist" />
                  <div className="h-4 w-32 rounded bg-mist" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
