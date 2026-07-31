import { z } from "zod";

/**
 * Checkout input. Note what is absent: any price, fee, or total. Money is
 * computed server-side from the cart and the vendor's rules, so the client only
 * ever names a shipping *method* and a payment *provider*.
 */

export const addressSchema = z.object({
  recipient: z.string().trim().min(2, "Enter the recipient's name").max(120),
  phone: z.string().trim().min(6, "Enter a phone number").max(32),
  line1: z.string().trim().min(3, "Enter a street address").max(200),
  line2: z.string().trim().max(200).optional().or(z.literal("")),
  city: z.string().trim().min(2, "Enter a city").max(120),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(32).optional().or(z.literal("")),
  // ISO 3166-1 alpha-2.
  country: z.string().trim().length(2, "Select a country").toUpperCase(),
});

export const checkoutSchema = z.object({
  address: addressSchema,
  shippingMethod: z.enum(["standard", "express"]),
  paymentProvider: z.enum(["stripe", "paymob", "cod", "wallet"]),
  /** Required for guests; ignored when signed in (the account's email is used). */
  guestEmail: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
});

export type AddressInput = z.infer<typeof addressSchema>;
export type CheckoutFormInput = z.infer<typeof checkoutSchema>;
