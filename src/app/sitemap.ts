import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { LAND_TYPE_SLUGS } from "@/lib/land";
import { site } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, plots, combos] = await Promise.all([
    db.city.findMany({ where: { properties: { some: { status: "ACTIVE" } } }, select: { id: true, slug: true, updatedAt: true } }),
    db.property.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, orderBy: { publishedAt: "desc" }, take: 45_000 }),
    db.property.groupBy({ by: ["cityId", "landType"], where: { status: "ACTIVE" } }),
  ]);
  const typesByCity = new Map<string, string[]>();
  for (const c of combos) if (c.landType !== "OTHER") typesByCity.set(c.cityId, [...(typesByCity.get(c.cityId) ?? []), LAND_TYPE_SLUGS[c.landType]]);
  const now = new Date();
  return [
    { url: site.url, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${site.url}/sell`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${site.url}/cities`, changeFrequency: "daily", priority: 0.7 },
    ...cities.flatMap((c) => [
      { url: `${site.url}/${c.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 },
      // Only city + land-type pages that actually have land (no empty pages for Google).
      ...(typesByCity.get(c.id) ?? []).map((slug) => ({ url: `${site.url}/${c.slug}/${slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ]),
    ...plots.map((p) => ({ url: `${site.url}/property/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
