import { ArrowLeft, Info } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingForm } from "@/components/listing/listing-form";
import { RemoveListingButton } from "@/components/seller/plot-actions";
import { Badge } from "@/components/ui/badge";
import type { ListingStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/seller/require";
import { updateSellerListing } from "@/server/actions/seller/listings";
import { getLiveCities } from "@/server/listings/queries";

export const metadata: Metadata = { title: "Edit property", robots: { index: false } };

const SECTIONS = [
  { id: "form-type", label: "Type" },
  { id: "form-location", label: "Location" },
  { id: "form-price", label: "Size & price" },
  { id: "form-photos", label: "Photos" },
  { id: "form-features", label: "Features" },
  { id: "form-description", label: "Description" },
];

const STATUS: Record<ListingStatus, { label: string; tone: "brand" | "amber" | "neutral" | "red" | "blue" }> = {
  PENDING: { label: "Pending approval", tone: "blue" },
  ACTIVE: { label: "Live", tone: "brand" },
  SOLD: { label: "Sold", tone: "neutral" },
  REJECTED: { label: "Not approved", tone: "red" },
  HIDDEN: { label: "Hidden", tone: "amber" },
};
export const dynamic = "force-dynamic";

export default async function EditPlotPage(props: PageProps<"/seller/plots/[id]/edit">) {
  const seller = await requireSeller();
  const { id } = await props.params;
  const p = await db.property.findFirst({ where: { id, sellerId: seller.id }, include: { images: { orderBy: { position: "asc" } } } });
  if (!p || p.status === "SOLD" || p.removedAt) notFound();
  const cities = await getLiveCities();
  const action = updateSellerListing.bind(null, p.id);

  const cover = p.images[0];
  const st = STATUS[p.status];

  return (
    <div className="bg-mist pb-16">
      <div className="container-page max-w-3xl pt-5 sm:pt-8">
        <Link href="/seller/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> My properties
        </Link>

        {/* What you're editing */}
        <div className="mt-1 flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line sm:gap-4 sm:p-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-mist sm:size-20">
            {cover && <Image src={cover.url} alt="" fill sizes="80px" className="object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone={st.tone} size="sm">{st.label}</Badge>
              <span className="truncate font-mono text-[11px] text-faint">{p.code}</span>
            </div>
            <h1 className="mt-1 truncate text-lg leading-tight font-bold text-ink sm:text-xl">Edit property</h1>
            <p className="truncate text-sm text-muted">{p.title}</p>
          </div>
        </div>

        {p.status === "ACTIVE" && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-sky-50 p-3.5 text-[13px] leading-relaxed text-sky-900 ring-1 ring-sky-100">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> After you save, our team checks the changes. Until then the listing is hidden from buyers.
          </p>
        )}

        {/* Jump to a section */}
        <nav aria-label="Sections" className="no-scrollbar sticky top-16 z-10 -mx-4 mt-3 flex gap-2 overflow-x-auto bg-mist/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
          {SECTIONS.map((sec) => (
            <a
              key={sec.id}
              href={`#${sec.id}`}
              className="inline-flex h-9 shrink-0 items-center rounded-full bg-white px-3.5 text-sm font-semibold text-ink-soft ring-1 ring-line transition hover:text-brand-800 hover:ring-brand-300"
            >
              {sec.label}
            </a>
          ))}
        </nav>

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

        <section className="mt-10 rounded-2xl bg-white p-4 ring-1 ring-red-100 sm:p-5">
          <h2 className="font-semibold text-ink">Remove this listing</h2>
          <p className="mt-1 text-sm text-muted">Sold it elsewhere or don&apos;t want to sell any more? Take it off InstaPlots for good.</p>
          <div className="mt-4">
            <RemoveListingButton id={p.id} title={p.title} />
          </div>
        </section>
      </div>
    </div>
  );
}
