import { z } from "zod";

/** Mongo ObjectId hex. Rejects junk before it reaches the service/database. */
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid identifier");

/** Identifies a cart line. `variantId` is absent for simple products. */
const cartItemRef = z.object({
  productId: objectId,
  variantId: objectId.optional(),
});

/** Upper bound is a sanity guard against a fat-fingered or scripted quantity. */
const MAX_QTY = 99;

export const addToCartSchema = cartItemRef.extend({
  quantity: z.number().int().min(1).max(MAX_QTY).default(1),
});

/** Quantity 0 is legal here — the service treats it as "remove this line". */
export const updateCartItemSchema = cartItemRef.extend({
  quantity: z.number().int().min(0).max(MAX_QTY),
});

export const removeCartItemSchema = cartItemRef;

export const applyCouponSchema = z.object({
  code: z.string().trim().min(1, "Enter a coupon code").max(64),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
