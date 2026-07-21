import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

/**
 * Avatar URL.
 *
 * Shape only — that this is an https URL of sane length. *Ownership* is checked
 * in the service, which knows who is acting: the value must be an asset this
 * application uploaded for that specific user (see `isOwnAvatarUrl`). It cannot
 * be checked here because a schema has no session.
 *
 * The form no longer takes a typed URL at all; it uploads to Cloudinary and
 * submits the returned `secure_url`. This field still exists because a server
 * action is reachable by direct POST, so the value arriving is not necessarily
 * the value the form produced.
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

/** Saved on its own, the moment an upload finishes. */
export const avatarOnlySchema = z.object({ avatar: avatarUrl });

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
