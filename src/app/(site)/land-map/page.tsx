import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandMap } from "@/components/land-map/land-map";
import { isLandParcelMapEnabled } from "@/lib/land-map/flag";
import { parcelCoverage } from "@/server/land-map/parcels";
import { placeSource, regionOutlines } from "@/server/land-map/places";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Land Parcel Map — Noida & Gautam Buddha Nagar",
  description: "Explore cadastral parcel boundaries in Gautam Buddha Nagar where authorized data is available.",
  // Not indexed while the feature is under review.
  robots: { index: false, follow: false },
};

/** The standalone parcel map. Behind LAND_PARCEL_MAP_ENABLED (off → 404, as if it didn't exist). */
export default async function LandMapPage() {
  if (!isLandParcelMapEnabled()) notFound();
  const coverage = await parcelCoverage().catch(() => []);
  return (
    <div className="h-[calc(100dvh-4rem)]">
      <LandMap region={regionOutlines()} initialCoverage={coverage} placeAttribution={placeSource.attribution} />
    </div>
  );
}
