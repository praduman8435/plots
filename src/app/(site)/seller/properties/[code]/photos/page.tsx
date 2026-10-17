import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoEditor } from "@/components/seller/photo-editor";
import { db } from "@/lib/db";
import { propertyCodeFromParam } from "@/lib/property-code";
import { requireSeller } from "@/lib/seller/require";

export const metadata: Metadata = { title: "Edit photos", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PropertyPhotosPage(props: PageProps<"/seller/properties/[code]/photos">) {
  const seller = await requireSeller();
  const { code: param } = await props.params;
  const code = propertyCodeFromParam(param);
  if (!code) notFound();
  const p = await db.property.findFirst({
    where: { code, sellerId: seller.id },
    select: { id: true, title: true, code: true, status: true, removedAt: true, images: { orderBy: { position: "asc" }, select: { url: true, width: true, height: true } } },
  });
  if (!p || p.status === "SOLD" || p.removedAt) notFound();

  return (
    <div className="bg-mist pb-16">
      <div className="container-page max-w-3xl pt-5 sm:pt-8">
        <Link href="/seller/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> My properties
        </Link>
        <h1 className="mt-1 text-2xl leading-tight font-bold text-ink">Edit photos</h1>
        <p className="mt-1 truncate text-sm text-muted">
          {p.title} · <span className="font-mono text-xs">{p.code}</span>
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">Add new photos, remove ones you don&apos;t want, or move your best photo to the front. The first photo is the cover buyers see.</p>
        <div className="mt-5">
          <PhotoEditor
            propertyId={p.id}
            live={p.status === "ACTIVE"}
            initial={p.images.map((i) => ({ url: i.url, width: i.width ?? 1600, height: i.height ?? 1200 }))}
          />
        </div>
      </div>
    </div>
  );
}
