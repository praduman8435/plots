// Client-safe copy of the sort labels (the server orderBy lives in server/listings/queries.ts).
export const SORTS = {
  recommended: { label: "Recommended" },
  newest: { label: "Newest first" },
  price_asc: { label: "Price: low to high" },
  price_desc: { label: "Price: high to low" },
} as const;
export type SortKey = keyof typeof SORTS;
