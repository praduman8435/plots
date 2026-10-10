import "server-only";
import { z } from "zod";
import { isOurImageUrl } from "@/server/storage";

/**
 * Photos attached to a listing (admin and seller forms): only URLs our own
 * storage produced (/media, bundled /demo, our Blob store), with sane
 * dimensions. Unknown keys are dropped, so nothing else reaches the database.
 */
export const listingImagesSchema = z
  .array(
    z.object({
      url: z.string().max(300).refine(isOurImageUrl, "Invalid image"),
      width: z.number().int().min(0).max(20_000),
      height: z.number().int().min(0).max(20_000),
    }),
  )
  .max(10, "Up to 10 photos");
