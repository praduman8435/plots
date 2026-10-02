import { ArrowLeft, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/listing/listing-form";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/seller/require";
import { updateSellerListing } from "@/server/actions/seller/listings";
import { getLiveCities } from "@/server/listings/queries";

export const metadata: Metadata = { title: "Edit property", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditPlotPage(props: PageProps<"/seller/plots/[id]/edit">) {
  const seller = await requireSeller();
  const { id } = await props.params;
  const p = await db.property.findFirst({ where: { id, sellerId: seller.id }, include: { images: { orderBy: { position: "asc" } } } });
  if (!p || p.status === "SOLD") notFound();
  const cities = await getLiveCities();
  const action = updateSellerListing.bind(null, p.id);

  return (
    <div className="bg-mist pb-16">
      <div className="container-page max-w-3xl pt-6 sm:pt-10">
        <Link href="/seller/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> My properties
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Edit property</h1>
        <p className="mt-1.5 text-[15px] text-muted">{p.title} · <span className="font-mono">{p.code}</span></p>
        {p.status === "ACTIVE" && (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-sky-50 p-3.5 text-sm text-sky-900 ring-1 ring-sky-100">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> After you save, we quickly re-check the changes. Your listing is hidden from buyers until then (usually a few hours).
          </p>
        )}
        <div className="mt-5">
          <ListingForm
            mode="seller"
            cities={cities.map((c) => ({ id: c.id, name: c.name, state: c.state, bighaInSqft: c.bighaInSqft, marlaInSqft: c.marlaInSqft, latitude: c.latitude, longitude: c.longitude }))}
            submitLabel="Save changes"
            action={action}
            initial={{
              landType: p.landType,
              cityId: p.cityId,
              locality: p.locality,
              village: p.village ?? undefined,
              latitude: p.latitude ?? undefined,
              longitude: p.longitude ?? undefined,
              area: p.area,
              areaUnit: p.areaUnit,
              price: Number(p.price),
              priceNegotiable: p.priceNegotiable,
              features: p.features as never,
              description: p.description,
              images: p.images.map((i) => ({ url: i.url, width: i.width ?? 1600, height: i.height ?? 1200 })),
            }}
          />
        </div>
      </div>
    </div>
  );
}
