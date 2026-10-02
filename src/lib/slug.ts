export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Readable and unique: "2-bigha-agricultural-land-in-sathiyaon-azamgarh-k3x9q". */
export function propertySlug(title: string, citySlug: string): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${slugify(`${title} ${citySlug}`)}-${suffix}`;
}
