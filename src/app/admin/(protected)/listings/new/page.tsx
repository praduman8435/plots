import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewListingForm } from "@/components/admin/new-listing-form";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/admin/require";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";

export const metadata: Metadata = { title: "Add a plot" };

export default async function AdminNewListingPage({ searchParams }: PageProps<"/admin/listings/new">) {
  await requireAdmin();
  const sp = await searchParams;
  const rawPhone = Array.isArray(sp.phone) ? sp.phone[0] : sp.phone;
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;

  const cities = await db.city.findMany({
    orderBy: [{ isLive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, state: true, bighaInSqft: true, isLive: true },
  });
  // Preselect the city while we operate in just one.
  const liveCities = cities.filter((c) => c.isLive);
  const defaultCityId = liveCities.length === 1 ? liveCities[0].id : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={
          <Link href="/admin/listings" className="inline-flex h-9 items-center gap-1.5 text-sm font-medium text-muted hover:text-brand-700">
            <ArrowLeft className="size-4" aria-hidden /> Listings
          </Link>
        }
        title="Add a plot for a seller"
        description="For sellers who sent details and photos on WhatsApp. Source is recorded as Admin."
      />
      <NewListingForm
        cities={cities.map((c) => ({ id: c.id, name: c.name, state: c.state, bighaInSqft: c.bighaInSqft }))}
        defaultCityId={defaultCityId}
        initialPhone={phone?.valid ? phone.normalized : undefined}
      />
    </div>
  );
}
