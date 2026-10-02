import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { WhatsAppSimulator } from "@/components/admin/whatsapp-simulator";
import { requireAdmin } from "@/lib/admin/require";
import { simulatorLoad } from "@/server/actions/admin/whatsapp";

export const metadata: Metadata = { title: "WhatsApp simulator" };
export const dynamic = "force-dynamic";

const DEFAULT_PHONE = "+919000000099";

export default async function WhatsAppSimulatorPage({ searchParams }: PageProps<"/admin/whatsapp/simulator">) {
  await requireAdmin();
  const sp = await searchParams;
  const phone = typeof sp.phone === "string" && sp.phone.trim() ? sp.phone : DEFAULT_PHONE;
  const initial = await simulatorLoad(phone);

  return (
    <>
      <PageHeader
        back={
          <Link href="/admin/whatsapp" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-brand-700">
            <ArrowLeft className="size-4" aria-hidden /> WhatsApp inbox
          </Link>
        }
        title="Listing assistant simulator"
        description="Chat with the WhatsApp assistant exactly as a seller would — no Meta account or phone needed."
      />
      <WhatsAppSimulator initial={initial} defaultProfileName="Ramesh Yadav" />
    </>
  );
}
