import type { ListingInput } from "@/lib/validation/listing";

/** An uploaded photo as returned by POST /api/uploads (same shape as server/storage's StoredImage). */
export type StoredImage = { url: string; width: number; height: number };

/** `bighaInSqft` is optional; when given, the form shows a live "≈ 54,450 sq ft" hint for Bigha/Biswa. */
export type ListingFormCity = { id: string; name: string; state: string; bighaInSqft?: number; marlaInSqft?: number; latitude?: number; longitude?: number };

export type ListingFormInitial = Partial<ListingInput> & { title?: string; images?: StoredImage[] };

/** What the form hands to its `action`. `listing` has already passed listingInputSchema on the client — re-validate on the server. */
export type ListingFormPayload = {
  listing: ListingInput;
  /** Ordered; the first photo is the cover. */
  images: StoredImage[];
  /** Admin mode only. Empty/undefined = use the automatic title. */
  title?: string;
};

export type ListingFormResult =
  | { ok: true; redirectTo: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> };

export type ListingFormAction = (payload: ListingFormPayload) => Promise<ListingFormResult>;
