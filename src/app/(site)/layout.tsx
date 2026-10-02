import { BottomNav } from "@/components/site/bottom-nav";
import { DemoBanner } from "@/components/site/demo-banner";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { VisitTracker } from "@/components/site/visit-tracker";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <DemoBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <BottomNav />
      <VisitTracker />
    </>
  );
}
