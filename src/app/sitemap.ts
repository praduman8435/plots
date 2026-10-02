import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { LAND_TYPE_SLUGS } from "@/lib/land";
import { site } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, plots] = await Promise.all([
    db.city.findMany({ where: { isLive: true }, select: { slug: true, updatedAt: true } }),
    db.property.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 45_000 }),
  ]);
  const now = new Date();
  return [
    { url: site.url, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${site.url}/sell`, changeFrequency: "monthly", priority: 0.6 },
    ...cities.flatMap((c) => [
      { url: `${site.url}/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 },
      ...Object.entries(LAND_TYPE_SLUGS)
        .filter(([t]) => t !== "OTHER")
        .map(([, slug]) => ({ url: `${site.url}/${c.slug}/${slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ]),
    ...plots.map((p) => ({ url: `${site.url}/property/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
