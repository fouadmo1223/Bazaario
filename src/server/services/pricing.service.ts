import { connectToDatabase } from "@/server/database/connection";
import { Coupon, type CouponDoc } from "@/server/database/models/coupon.model";
import { Errors } from "@/shared/lib/errors";
import {
  type Minor,
  ZERO,
  toMinor,
  toMajor,
  addMinor,
  subMinor,
  timesQuantity,
  percentOf,
  sumMinor,
  minMinor,
  clampToZero,
} from "@/shared/lib/money";

export type CartLine = { unitPrice: number; quantity: number };

export type Totals = {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
};

/** TODO: replace with per-vendor tax rules (jurisdiction + product class). */
const DEFAULT_TAX_RATE = 0.14;

/**
 * The tax rate to apply for a vendor. Kept here as the single source so the cart
 * preview and the checkout that charges the customer can never disagree.
 */
export function vendorTaxRate(settings: { taxInclusive: boolean }): number {
  return settings.taxInclusive ? 0 : DEFAULT_TAX_RATE;
}

/**
 * Sum cart lines, exactly, in cents.
 *
 * Exported because the subtotal is also what decides whether a coupon's minimum
 * spend is met, and that check runs before `computeTotals` does. Computing it a
 * second way there — `lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)`,
 * as checkout used to — reintroduces the drift for that one comparison: a cart
 * of 0.35 and 0.70 sums to 1.0499999999999998, so a coupon with a 1.05 minimum
 * is refused on a cart that meets it.
 */
export function subtotalOf(lines: CartLine[]): Minor {
  return sumMinor(lines.map((line) => timesQuantity(toMinor(line.unitPrice), line.quantity)));
}

/**
 * Validate a coupon against the current cart. Throws with a user-safe message
 * when invalid. Does NOT increment usage — that happens on successful order.
 */
export async function validateCoupon(
  vendorId: string,
  code: string,
  subtotal: number,
): Promise<CouponDoc> {
  await connectToDatabase();
  const coupon = await Coupon.findOne({ vendor: vendorId, code: code.toUpperCase(), isActive: true });
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

/**
 * Resolve a cart's stored coupon for a *preview*, or null if it no longer holds.
 *
 * Same check as checkout, deliberately: the cart page and the checkout that
 * charges the customer must not disagree about whether a coupon applies. An
 * earlier version of the cart preview matched on `isActive` alone, so an
 * expired or exhausted coupon — or one whose minimum spend the cart had since
 * dropped below — kept showing a discount that checkout then refused.
 *
 * Where checkout throws, this returns null: a preview has no one to report to,
 * and the customer finds out at checkout, which is where the message belongs.
 */
export async function resolveCouponForPreview(
  vendorId: string,
  code: string | null | undefined,
  lines: CartLine[],
): Promise<CouponDoc | null> {
  if (!code) return null;
  return validateCoupon(vendorId, code, toMajor(subtotalOf(lines))).catch(() => null);
}

/**
 * Discount a coupon yields against a subtotal, in cents.
 *
 * Shipping is not an input: a free-shipping coupon reports the fact and the
 * caller zeroes the fee. The discount is capped at the subtotal so a generous
 * fixed-amount coupon cannot produce a negative order.
 */
export function couponDiscount(
  coupon: CouponDoc,
  subtotal: Minor,
): { discount: Minor; freeShipping: boolean } {
  if (coupon.type === "free_shipping") return { discount: ZERO, freeShipping: true };
  if (coupon.type === "fixed") {
    return { discount: minMinor(toMinor(coupon.value), subtotal), freeShipping: false };
  }

  // Percentage. `coupon.value` is a percentage (10 = 10%), not an amount.
  let discount = percentOf(subtotal, coupon.value);
  if (coupon.maxDiscount != null) discount = minMinor(discount, toMinor(coupon.maxDiscount));
  return { discount: minMinor(discount, subtotal), freeShipping: false };
}

/**
 * Compute order totals.
 *
 * Every step runs in whole cents and only the final `Totals` converts back to
 * decimals for storage. Doing it the other way — rounding to two decimals after
 * each step, as this used to — is correct for any single figure but leaves the
 * stored values as floats that later code then sums, which is exactly how the
 * refund bugs happened.
 *
 * `taxRate` is a fraction (0.14 = 14%), matching how callers configure it;
 * `percentOf` wants a percentage, hence the conversion at the call.
 */
export function computeTotals(
  lines: CartLine[],
  opts: { coupon?: CouponDoc | null; taxRate?: number; shippingBase?: number; taxInclusive?: boolean } = {},
): Totals {
  const subtotal = subtotalOf(lines);

  let shipping = toMinor(opts.shippingBase ?? 0);
  let discount = ZERO;
  if (opts.coupon) {
    const result = couponDiscount(opts.coupon, subtotal);
    discount = result.discount;
    if (result.freeShipping) shipping = ZERO;
  }

  const taxable = clampToZero(subMinor(subtotal, discount));
  const tax = opts.taxInclusive ? ZERO : percentOf(taxable, (opts.taxRate ?? 0) * 100);
  const grandTotal = addMinor(addMinor(taxable, tax), shipping);

  return {
    subtotal: toMajor(subtotal),
    discount: toMajor(discount),
    tax: toMajor(tax),
    shipping: toMajor(shipping),
    grandTotal: toMajor(grandTotal),
  };
}
