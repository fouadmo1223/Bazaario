import { connectToDatabase } from "@/server/database/connection";
import { Coupon, type CouponDoc } from "@/server/database/models/coupon.model";
import { Product } from "@/server/database/models/product.model";
import { Order } from "@/server/database/models/order.model";
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

/**
 * A cart line, priced.
 *
 * `productId` and `categories` are optional because most pricing needs only the
 * money: they exist so a coupon scoped to specific products or categories can
 * tell which lines it may discount. A caller that leaves them off is treated as
 * having no line eligible for a scoped coupon — so scoping *fails closed*, never
 * quietly discounting the whole cart.
 */
export type CartLine = {
  unitPrice: number;
  quantity: number;
  productId?: string;
  categories?: string[];
};

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
 * Does this coupon target specific products or categories rather than the whole
 * cart? Written defensively because the pure test fixtures build coupon-shaped
 * objects without these arrays — a real document always has them (default `[]`).
 */
function isCouponScoped(coupon: CouponDoc): boolean {
  return (coupon.appliesToProducts?.length ?? 0) > 0 || (coupon.appliesToCategories?.length ?? 0) > 0;
}

/** Whether a scoped coupon reaches this particular line. */
function lineInCouponScope(coupon: CouponDoc, line: CartLine): boolean {
  const byProduct =
    line.productId != null &&
    (coupon.appliesToProducts ?? []).some((id) => String(id) === line.productId);
  const byCategory = (line.categories ?? []).some((c) =>
    (coupon.appliesToCategories ?? []).some((id) => String(id) === c),
  );
  return byProduct || byCategory;
}

/**
 * The portion of the cart a coupon may discount: the whole subtotal, or — for a
 * coupon scoped to products/categories — only the lines it targets. A shopper
 * with a "20% off audio" coupon gets 20% of the audio in their cart, not 20% of
 * everything.
 */
export function discountableSubtotal(coupon: CouponDoc, lines: CartLine[]): Minor {
  if (!isCouponScoped(coupon)) return subtotalOf(lines);
  return subtotalOf(lines.filter((line) => lineInCouponScope(coupon, line)));
}

/**
 * Attach the data coupon scoping needs (each line's product categories) to
 * otherwise money-only lines, in a single query. Callers that already hold the
 * products — checkout re-prices from them — should fill `categories` directly
 * instead of paying for this.
 */
export async function withCouponScope(
  lines: { productId: string; unitPrice: number; quantity: number }[],
): Promise<CartLine[]> {
  if (lines.length === 0) return [];
  await connectToDatabase();
  const products = await Product.find({ _id: { $in: lines.map((l) => l.productId) } }).select(
    "_id categories",
  );
  const categoriesById = new Map(
    products.map((p) => [String(p._id), (p.categories ?? []).map((c) => String(c))]),
  );
  return lines.map((line) => ({ ...line, categories: categoriesById.get(line.productId) ?? [] }));
}

/**
 * How many times this user has already redeemed the coupon. Counts every order
 * that carried the code except cancelled ones — a cancelled order never charged,
 * so it should not spend the shopper's allowance. (Matches nothing for a guest:
 * there is no durable per-person identity to count against, so `perUserLimit` is
 * only enforceable for signed-in shoppers.)
 */
async function redemptionsByUser(vendorId: string, code: string, userId: string): Promise<number> {
  return Order.countDocuments({
    vendor: vendorId,
    coupon: code,
    customer: userId,
    status: { $ne: "cancelled" },
  });
}

/**
 * Validate a coupon against the current cart. Throws with a user-safe message
 * when invalid. Does NOT increment usage — that happens on successful order.
 *
 * `opts.userId` enables the per-user limit (skipped for guests, who have no
 * durable identity). `opts.lines` enables product/category scoping — without
 * them a scoped coupon cannot be checked and is refused, so validity never
 * disagrees with the discount the cart would actually compute.
 */
export async function validateCoupon(
  vendorId: string,
  code: string,
  subtotal: number,
  opts: { userId?: string; lines?: CartLine[] } = {},
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

  if (isCouponScoped(coupon)) {
    const reaches = (opts.lines ?? []).some((line) => lineInCouponScope(coupon, line));
    if (!reaches) throw Errors.badRequest("This coupon does not apply to anything in your cart");
  }

  if (coupon.perUserLimit != null && opts.userId) {
    const used = await redemptionsByUser(vendorId, coupon.code, opts.userId);
    if (used >= coupon.perUserLimit) throw Errors.badRequest("You have already used this coupon");
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
  opts: { userId?: string } = {},
): Promise<CouponDoc | null> {
  if (!code) return null;
  return validateCoupon(vendorId, code, toMajor(subtotalOf(lines)), {
    userId: opts.userId,
    lines,
  }).catch(() => null);
}

/**
 * Discount a coupon yields against a base amount, in cents.
 *
 * The base is the subtotal the coupon may touch — the whole cart, or just the
 * lines a scoped coupon targets (see `discountableSubtotal`). Shipping is not an
 * input: a free-shipping coupon reports the fact and the caller zeroes the fee.
 * The discount is capped at the base so a generous fixed-amount coupon cannot
 * produce a negative order.
 */
export function couponDiscount(
  coupon: CouponDoc,
  base: Minor,
): { discount: Minor; freeShipping: boolean } {
  if (coupon.type === "free_shipping") return { discount: ZERO, freeShipping: true };
  if (coupon.type === "fixed") {
    return { discount: minMinor(toMinor(coupon.value), base), freeShipping: false };
  }

  // Percentage. `coupon.value` is a percentage (10 = 10%), not an amount.
  let discount = percentOf(base, coupon.value);
  if (coupon.maxDiscount != null) discount = minMinor(discount, toMinor(coupon.maxDiscount));
  return { discount: minMinor(discount, base), freeShipping: false };
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
    // A scoped coupon discounts only the lines it targets, not the whole cart.
    const base = discountableSubtotal(opts.coupon, lines);
    const result = couponDiscount(opts.coupon, base);
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
