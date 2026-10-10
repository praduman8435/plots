import { BottomNav } from "@/components/site/bottom-nav";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { NotFoundContent } from "@/components/site/not-found-content";

/** URLs that match no route at all: no site layout around this, so it brings its own header and footer. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <NotFoundContent />
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
