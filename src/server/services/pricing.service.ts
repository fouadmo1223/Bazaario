import { connectToDatabase } from "@/server/database/connection";
import { Coupon, type CouponDoc } from "@/server/database/models/coupon.model";
import { Errors } from "@/shared/lib/errors";

export type CartLine = { unitPrice: number; quantity: number };

export type Totals = {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Validate a coupon against the current cart. Throws with a user-safe message
 * when invalid. Does NOT increment usage — that happens on successful order.
 */
export async function validateCoupon(
  marketId: string,
  code: string,
  subtotal: number,
): Promise<CouponDoc> {
  await connectToDatabase();
  const coupon = await Coupon.findOne({ market: marketId, code: code.toUpperCase(), isActive: true });
  if (!coupon) throw Errors.badRequest("Invalid coupon code");

  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw Errors.badRequest("Coupon is not active yet");
  if (coupon.expiresAt && coupon.expiresAt.getTime() < now) throw Errors.badRequest("Coupon has expired");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
    throw Errors.badRequest("Coupon usage limit reached");
  }
  if (subtotal < coupon.minSpend) {
    throw Errors.badRequest(`Spend at least ${coupon.minSpend} to use this coupon`);
  }
  return coupon;
}

/** Discount amount a coupon yields against a subtotal (shipping handled separately). */
export function couponDiscount(coupon: CouponDoc, subtotal: number, shipping: number): { discount: number; freeShipping: boolean } {
  if (coupon.type === "free_shipping") return { discount: 0, freeShipping: true };
  if (coupon.type === "fixed") return { discount: Math.min(coupon.value, subtotal), freeShipping: false };
  // percentage
  let d = (subtotal * coupon.value) / 100;
  if (coupon.maxDiscount != null) d = Math.min(d, coupon.maxDiscount);
  return { discount: Math.min(d, subtotal), freeShipping: false };
}

/**
 * Compute order totals. `taxRate` is a fraction (0.14 = 14%), `shippingBase`
 * is the method's flat fee. Coupons apply to subtotal before tax.
 */
export function computeTotals(
  lines: CartLine[],
  opts: { coupon?: CouponDoc | null; taxRate?: number; shippingBase?: number; taxInclusive?: boolean } = {},
): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));

  let shipping = opts.shippingBase ?? 0;
  let discount = 0;
  if (opts.coupon) {
    const res = couponDiscount(opts.coupon, subtotal, shipping);
    discount = round2(res.discount);
    if (res.freeShipping) shipping = 0;
  }

  const taxable = Math.max(0, subtotal - discount);
  const taxRate = opts.taxRate ?? 0;
  const tax = opts.taxInclusive ? 0 : round2(taxable * taxRate);

  const grandTotal = round2(taxable + tax + shipping);
  return { subtotal, discount, tax, shipping, grandTotal };
}
