import { z } from "zod";

/** A 24-hex Mongo id, the shape the scope selects submit. */
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

/**
 * Create/edit payload for a coupon.
 *
 * One schema for both: the edit modal submits every field, so there is no
 * partial update to model, and a single shape keeps the two forms from drifting.
 * `code` is folded to upper case here — the model stores it upper, checkout looks
 * it up upper, and a vendor should not be able to create `Summer` and `SUMMER`
 * as two coupons that then collide at redemption.
 *
 * The cross-field rules (a percentage over 100, a zero discount, an end before
 * the start) live in `superRefine` so the message lands on the offending field.
 */
export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, "At least 2 characters")
      .max(40, "At most 40 characters")
      .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Letters, numbers, - and _ only")
      .transform((s) => s.toUpperCase()),
    description: z.string().trim().max(200).nullable().default(null),
    type: z.enum(["percentage", "fixed", "free_shipping"]),
    value: z.number().min(0).default(0),
    minSpend: z.number().min(0).default(0),
    maxDiscount: z.number().min(0).nullable().default(null),
    usageLimit: z.number().int().min(1).nullable().default(null),
    perUserLimit: z.number().int().min(1).nullable().default(null),
    appliesToProducts: z.array(objectId).default([]),
    appliesToCategories: z.array(objectId).default([]),
    startsAt: z.coerce.date().nullable().default(null),
    expiresAt: z.coerce.date().nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type === "percentage" && v.value > 100) {
      ctx.addIssue({ path: ["value"], code: "custom", message: "A percentage can’t exceed 100." });
    }
    if (v.type !== "free_shipping" && v.value <= 0) {
      ctx.addIssue({ path: ["value"], code: "custom", message: "Enter a discount greater than 0." });
    }
    if (v.type !== "percentage" && v.maxDiscount != null) {
      ctx.addIssue({
        path: ["maxDiscount"],
        code: "custom",
        message: "A cap only applies to a percentage coupon.",
      });
    }
    if (v.startsAt && v.expiresAt && v.expiresAt <= v.startsAt) {
      ctx.addIssue({ path: ["expiresAt"], code: "custom", message: "The end must be after the start." });
    }
  });

export type CouponInput = z.infer<typeof couponInputSchema>;
