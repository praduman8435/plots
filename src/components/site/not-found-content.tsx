import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

/** The 404 message. Rendered inside the site layout (which brings the header and footer) or by the root not-found page. */
export function NotFoundContent() {
  return (
    <div className="container-page flex flex-1 flex-col items-center justify-center py-20 text-center sm:py-24">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
        <Compass className="size-7" aria-hidden />
      </span>
      <p className="mt-6 text-sm font-semibold tracking-wide text-brand-700">404</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Page not found</h1>
      <p className="mt-3 max-w-md text-[15px] text-muted">The link may be wrong, or the page was moved or taken down. Let&apos;s get you back to land that&apos;s available.</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/search" size="lg">
          Browse land
        </ButtonLink>
        <ButtonLink href="/" size="lg" variant="secondary">
          Go home
        </ButtonLink>
      </div>
    </div>
  );
}
