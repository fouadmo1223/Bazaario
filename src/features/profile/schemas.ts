import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/**
 * Avatar URL.
 *
 * Restricted to https, and to a URL rather than an upload, because there is no
 * storage integration yet (no Cloudinary/S3 — see ARCHITECTURE §8.3). Plain
 * http is refused because the page is served over https in production and a
 * mixed-content image silently fails to load.
 *
 * `data:` and `blob:` are refused by `z.url()` combined with the protocol
 * check: a base64 avatar would be embedded in every query that returns the
 * user, which is how a 2KB document becomes 200KB.
 */
const avatarUrl = z
  .string()
  .trim()
  .url("Enter a valid image URL")
  .refine((u) => u.startsWith("https://"), "Image URL must start with https://")
  .max(2000)
  .nullish()
  .or(z.literal("").transform(() => null));

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .or(z.literal("").transform(() => null)),
  avatar: avatarUrl,
});

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipient: z.string().trim().min(1, "Recipient is required").max(120),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  line1: z.string().trim().min(1, "Address is required").max(200),
  line2: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .or(z.literal("").transform(() => null)),
  city: z.string().trim().min(1, "City is required").max(100),
  region: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .or(z.literal("").transform(() => null)),
  postalCode: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .or(z.literal("").transform(() => null)),
  country: z.string().trim().min(2, "Country is required").max(60),
  isDefault: z.boolean().optional(),
});

export const addressIdSchema = z.object({ addressId: objectId });

export const updateAddressSchema = addressSchema.extend({ addressId: objectId });

export type ProfileFormValues = z.infer<typeof profileSchema>;
export type AddressFormValues = z.infer<typeof addressSchema>;
