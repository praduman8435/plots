import { z } from "zod";
import { AreaUnit, LandType } from "@/generated/prisma/enums";
import { FEATURE_OPTIONS } from "@/lib/land";

const optionalText = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((v) => (v ? v : undefined));

const optionalCoord = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(min).max(max).optional());

/** Shared by the seller "Add plot" form, the admin form and the WhatsApp assistant. */
export const listingInputSchema = z.object({
  cityId: z.string().min(1, "Choose a city"),
  landType: z.enum(Object.values(LandType) as [LandType, ...LandType[]], { message: "Choose the land type" }),
  area: z.coerce.number({ message: "Enter the land size" }).positive("Enter the land size").max(10_000_000),
  areaUnit: z.enum(Object.values(AreaUnit) as [AreaUnit, ...AreaUnit[]]),
  price: z.coerce
    .number({ message: "Enter the expected price" })
    .int()
    .min(10_000, "Price looks too low — enter the total price in ₹")
    .max(10_000_000_000),
  priceNegotiable: z.coerce.boolean().default(true),
  locality: z.string().trim().min(2, "Enter the area or locality").max(120),
  village: optionalText,
  latitude: optionalCoord(-90, 90),
  longitude: optionalCoord(-180, 180),
  description: z.string().trim().min(15, "Add a short description (at least 15 characters)").max(2000),
  features: z.array(z.enum(FEATURE_OPTIONS)).default([]),
});

export type ListingInput = z.infer<typeof listingInputSchema>;

export const sellerInputSchema = z.object({
  name: z.string().trim().min(2, "Enter the seller's name").max(80),
  phone: z.string().trim().min(10, "Enter a 10-digit mobile number"),
  sellerType: z.enum(["OWNER", "BROKER"]),
});
