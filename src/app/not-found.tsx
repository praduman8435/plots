import { Compass } from "lucide-react";
import { BottomNav } from "@/components/site/bottom-nav";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Compass className="size-7" aria-hidden />
        </span>
        <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">This plot isn&apos;t on the map</h1>
        <p className="mt-3 max-w-md text-muted">The page may have moved, or the plot was taken down. Let&apos;s get you back to available land.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/search" size="lg">Browse plots</ButtonLink>
          <ButtonLink href="/" size="lg" variant="secondary">Go home</ButtonLink>
        </div>
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
