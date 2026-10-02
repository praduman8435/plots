import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListingForm } from "@/components/listing/listing-form";
import { IdentityCard } from "@/components/seller/identity-card";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/seller/require";
import { createSellerListing } from "@/server/actions/seller/listings";
import { getKycProvider } from "@/server/kyc/provider";
import { getLiveCities } from "@/server/listings/queries";

export const metadata: Metadata = { title: "Add a property", robots: { index: false } };
export const dynamic = "force-dynamic";

/** "Add another property": only property details — the seller profile is reused, never asked again. */
export default async function NewPlotPage(props: PageProps<"/seller/plots/new">) {
  const seller = await requireSeller();
  const sp = await props.searchParams;
  const kyc = getKycProvider();
  const [cities, count] = await Promise.all([getLiveCities(), db.property.count({ where: { sellerId: seller.id } })]);
  const first = count === 0;

  // One-time identity check before a web listing (only when a KYC provider is set up).
  if (kyc && seller.identityStatus !== "VERIFIED") {
    return (
      <div className="min-h-[calc(100dvh-4rem)] bg-mist pb-16">
        <div className="mx-auto max-w-lg px-4 pt-8 sm:pt-12">
          <IdentityCard next="/seller/plots/new" providerLabel={kyc.label} failed={sp.kyc === "failed"} title="First, verify your identity — once" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mist pb-16">
      <div className="container-page max-w-3xl pt-6 sm:pt-10">
        <Link href="/seller/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> My properties
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{first ? "Add your first property" : "Add another property"}</h1>
        <p className="mt-1.5 text-[15px] text-muted">
          {seller.name} · <span className="font-mono">{seller.code}</span> — just a few details about the land.
        </p>
        <div className="mt-5">
          <ListingForm
            mode="seller"
            wizard={{ draftKey: `plots.draft.${seller.id}` }}
            cities={cities.map((c) => ({ id: c.id, name: c.name, state: c.state, bighaInSqft: c.bighaInSqft, marlaInSqft: c.marlaInSqft, latitude: c.latitude, longitude: c.longitude }))}
            submitLabel="Submit"
            action={createSellerListing}
          />
        </div>
      </div>
    </div>
  );
}
