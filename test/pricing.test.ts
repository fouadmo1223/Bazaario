import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import {
  computeTotals,
  couponDiscount,
  discountableSubtotal,
  resolveCouponForPreview,
  subtotalOf,
  validateCoupon,
  vendorTaxRate,
  type CartLine,
} from "@/server/services/pricing.service";
import type { CouponDoc } from "@/server/database/models/coupon.model";
import { Order, type OrderStatus } from "@/server/database/models/order.model";
import { toMinor, toMajor } from "@/shared/lib/money";
import { makeVendor, makeCoupon, makeProduct, makeUser } from "./factories";

/**
 * Coupon and tax arithmetic.
 *
 * This is the same arithmetic — sums and percentages over stored decimal
 * amounts — that produced both refund bugs, so the cases here lean on amounts
 * chosen to be inexact in binary rather than round numbers that would pass
 * either way.
 *
 * The pure blocks need no database. `validateCoupon` reads one, so those tests
 * pay the round trip.
 */

/**
 * A coupon shaped like the document, without a database round trip. The scope
 * arrays accept plain string ids — scope matching compares them as strings, so a
 * pure test needn't mint ObjectIds.
 */
function coupon(
  fields: Partial<Omit<CouponDoc, "appliesToProducts" | "appliesToCategories">> & {
    appliesToProducts?: string[];
    appliesToCategories?: string[];
  },
): CouponDoc {
  return { type: "percentage", value: 10, maxDiscount: null, ...fields } as unknown as CouponDoc;
}

const line = (unitPrice: number, quantity = 1): CartLine => ({ unitPrice, quantity });

/** A line tagged with a product and its categories, for coupon-scope tests. */
const scopedLine = (
  unitPrice: number,
  ids: { productId?: string; categories?: string[] },
  quantity = 1,
): CartLine => ({ unitPrice, quantity, ...ids });

let orderSeq = 0;

/** A minimal order that carries a coupon, for per-user-limit counting. */
async function redemption(
  vendorId: string,
  userId: string,
  code: string,
  status: OrderStatus = "paid",
): Promise<void> {
  await Order.create({
    vendor: vendorId,
    number: `R${Date.now()}-${orderSeq++}`,
    customer: userId,
    coupon: code,
    items: [],
    totals: { subtotal: 0, grandTotal: 0 },
    status,
  });
}

describe("subtotalOf", () => {
  it("sums lines exactly where floats would drift", () => {
    // 0.35 + 0.70 is 1.0499999999999998 as floats.
    expect(0.35 + 0.7).toBeLessThan(1.05);
    expect(subtotalOf([line(0.35), line(0.7)])).toBe(toMinor(1.05));
  });

  it("multiplies by quantity before summing", () => {
    expect(subtotalOf([line(19.99, 3), line(0.07, 2)])).toBe(6011);
  });

  it("is zero for an empty cart", () => {
    expect(subtotalOf([])).toBe(0);
  });
});

describe("couponDiscount", () => {
  it("takes a percentage of the subtotal, rounded to the nearest cent", () => {
    // 8.11 * 14% = 1.1354 → 1.14
    const { discount } = couponDiscount(coupon({ value: 14 }), toMinor(8.11));
    expect(discount).toBe(114);
  });

  it("caps a percentage discount at maxDiscount", () => {
    const { discount } = couponDiscount(coupon({ value: 50, maxDiscount: 20 }), toMinor(100));
    expect(discount).toBe(2000);
  });

  it("leaves a percentage discount alone when it is under the cap", () => {
    const { discount } = couponDiscount(coupon({ value: 10, maxDiscount: 20 }), toMinor(100));
    expect(discount).toBe(1000);
  });

  it("caps a fixed discount at the subtotal", () => {
    const { discount } = couponDiscount(coupon({ type: "fixed", value: 50 }), toMinor(30));
    expect(discount).toBe(3000);
  });

  it("reports free shipping instead of a discount", () => {
    const result = couponDiscount(coupon({ type: "free_shipping", value: 0 }), toMinor(100));
    expect(result).toEqual({ discount: 0, freeShipping: true });
  });
});

describe("discountableSubtotal", () => {
  const lines = [
    scopedLine(100, { productId: "p1", categories: ["audio"] }),
    scopedLine(40, { productId: "p2", categories: ["home"] }),
  ];

  it("is the whole subtotal for an unscoped coupon", () => {
    expect(discountableSubtotal(coupon({}), lines)).toBe(toMinor(140));
  });

  it("counts only the targeted product when scoped to products", () => {
    const c = coupon({ appliesToProducts: ["p1"] });
    expect(discountableSubtotal(c, lines)).toBe(toMinor(100));
  });

  it("counts only lines in a targeted category when scoped to categories", () => {
    const c = coupon({ appliesToCategories: ["home"] });
    expect(discountableSubtotal(c, lines)).toBe(toMinor(40));
  });

  it("is zero when a scoped coupon reaches nothing in the cart", () => {
    const c = coupon({ appliesToProducts: ["nope"] });
    expect(discountableSubtotal(c, lines)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("adds tax and shipping to an undiscounted subtotal", () => {
    const totals = computeTotals([line(100)], { taxRate: 0.14, shippingBase: 5 });
    expect(totals).toEqual({
      subtotal: 100,
      discount: 0,
      tax: 14,
      shipping: 5,
      grandTotal: 119,
    });
  });

  /**
   * The ordering that matters most: tax follows the discount. Taxing the full
   * subtotal instead would overcharge every discounted order by the tax on the
   * discount — here 1.40, silently, on every one.
   */
  it("taxes the discounted subtotal, not the original", () => {
    const totals = computeTotals([line(100)], {
      coupon: coupon({ value: 10 }),
      taxRate: 0.14,
    });
    expect(totals.discount).toBe(10);
    expect(totals.tax).toBe(12.6); // 14% of 90, not of 100
    expect(totals.grandTotal).toBe(102.6);
  });

  it("does not tax shipping", () => {
    const totals = computeTotals([line(100)], { taxRate: 0.14, shippingBase: 50 });
    expect(totals.tax).toBe(14); // not 21
    expect(totals.grandTotal).toBe(164);
  });

  it("charges no tax when the vendor's prices are tax-inclusive", () => {
    const totals = computeTotals([line(100)], { taxRate: 0.14, taxInclusive: true });
    expect(totals.tax).toBe(0);
    expect(totals.grandTotal).toBe(100);
  });

  it("zeroes the shipping fee for a free-shipping coupon", () => {
    const totals = computeTotals([line(100)], {
      coupon: coupon({ type: "free_shipping", value: 0 }),
      shippingBase: 25,
      taxRate: 0.14,
    });
    expect(totals.shipping).toBe(0);
    expect(totals.discount).toBe(0);
    expect(totals.grandTotal).toBe(114);
  });

  /**
   * A fixed coupon worth more than the cart must settle the cart, not hand
   * money back — and must not drag the tax negative on the way.
   */
  it("never produces a negative total from an over-generous coupon", () => {
    const totals = computeTotals([line(10)], {
      coupon: coupon({ type: "fixed", value: 50 }),
      taxRate: 0.14,
      shippingBase: 5,
    });
    expect(totals.discount).toBe(10);
    expect(totals.tax).toBe(0);
    expect(totals.grandTotal).toBe(5); // shipping still owed
  });

  it("omits tax entirely when no rate is given", () => {
    expect(computeTotals([line(100)]).tax).toBe(0);
  });

  /**
   * The whole point of running in cents: the parts must add up to the whole
   * exactly, because later code sums the stored values.
   */
  it("produces totals whose parts reconcile exactly", () => {
    const totals = computeTotals([line(0.35), line(0.7), line(8.11, 3)], {
      coupon: coupon({ value: 7 }),
      taxRate: 0.14,
      shippingBase: 4.99,
    });

    const taxable = toMinor(totals.subtotal) - toMinor(totals.discount);
    const expected = taxable + toMinor(totals.tax) + toMinor(totals.shipping);
    expect(toMinor(totals.grandTotal)).toBe(expected);
    expect(toMajor(toMinor(totals.grandTotal))).toBe(totals.grandTotal);
  });

  it("handles an empty cart without producing NaN", () => {
    const totals = computeTotals([], { taxRate: 0.14 });
    expect(totals).toEqual({ subtotal: 0, discount: 0, tax: 0, shipping: 0, grandTotal: 0 });
  });

  /**
   * A product/category-scoped coupon discounts only the lines it targets: 20%
   * off the $100 audio line is $20, not 20% of the whole $140 cart.
   */
  it("discounts only the scoped lines, not the whole cart", () => {
    const lines = [
      scopedLine(100, { productId: "p1", categories: ["audio"] }),
      scopedLine(40, { productId: "p2", categories: ["home"] }),
    ];
    const totals = computeTotals(lines, {
      coupon: coupon({ value: 20, appliesToProducts: ["p1"] }),
    });
    expect(totals.subtotal).toBe(140);
    expect(totals.discount).toBe(20); // 20% of 100, not of 140
    expect(totals.grandTotal).toBe(120);
  });
});

describe("vendorTaxRate", () => {
  it("is zero when prices already include tax", () => {
    expect(vendorTaxRate({ taxInclusive: true })).toBe(0);
    expect(vendorTaxRate({ taxInclusive: false })).toBeGreaterThan(0);
  });
});

describe("validateCoupon", () => {
  it("finds an active coupon regardless of the case typed", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "SUMMER" });

    const found = await validateCoupon(String(vendor._id), "summer", 100);
    expect(found.code).toBe("SUMMER");
  });

  it("rejects an unknown code", async () => {
    const vendor = await makeVendor();
    await expect(validateCoupon(String(vendor._id), "NOPE", 100)).rejects.toThrow(/invalid/i);
  });

  it("rejects a deactivated coupon", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "OFF", isActive: false });
    await expect(validateCoupon(String(vendor._id), "OFF", 100)).rejects.toThrow(/invalid/i);
  });

  /**
   * Coupons are vendor-scoped, so one store's code must not spend in another's
   * — the codes are chosen by vendors and will collide.
   */
  it("does not honour another vendor's coupon", async () => {
    const [mine, theirs] = await Promise.all([makeVendor(), makeVendor()]);
    await makeCoupon(theirs._id, { code: "SHARED" });

    await expect(validateCoupon(String(mine._id), "SHARED", 100)).rejects.toThrow(/invalid/i);
  });

  it("rejects a coupon that has not started", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "SOON", startsAt: new Date(Date.now() + 60_000) });

    await expect(validateCoupon(String(vendor._id), "SOON", 100)).rejects.toThrow(/not active yet/i);
  });

  it("rejects an expired coupon", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "GONE", expiresAt: new Date(Date.now() - 60_000) });

    await expect(validateCoupon(String(vendor._id), "GONE", 100)).rejects.toThrow(/expired/i);
  });

  it("accepts a coupon inside its window", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, {
      code: "NOW",
      startsAt: new Date(Date.now() - 60_000),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(validateCoupon(String(vendor._id), "NOW", 100)).resolves.toBeTruthy();
  });

  it("rejects a coupon that has reached its usage limit", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "MAXED", usageLimit: 5, usedCount: 5 });

    await expect(validateCoupon(String(vendor._id), "MAXED", 100)).rejects.toThrow(/usage limit/i);
  });

  it("accepts a coupon with redemptions still left", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "LEFT", usageLimit: 5, usedCount: 4 });

    await expect(validateCoupon(String(vendor._id), "LEFT", 100)).resolves.toBeTruthy();
  });

  it("rejects a cart under the minimum spend", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "BIG", minSpend: 50 });

    await expect(validateCoupon(String(vendor._id), "BIG", 49.99)).rejects.toThrow(/spend at least/i);
  });

  /**
   * The boundary, and the reason callers must compute the subtotal exactly: a
   * cart of 0.35 and 0.70 sums to 1.0499999999999998 as plain floats, which is
   * *less than* a 1.05 minimum and would reject a cart that does qualify.
   */
  it("accepts a cart sitting exactly on the minimum spend", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "EXACT", minSpend: 1.05 });

    const subtotal = toMajor(subtotalOf([line(0.35), line(0.7)]));
    await expect(validateCoupon(String(vendor._id), "EXACT", subtotal)).resolves.toBeTruthy();
  });

  describe("product / category scope", () => {
    it("accepts a scoped coupon when the cart holds a targeted product", async () => {
      const vendor = await makeVendor();
      const product = await makeProduct(vendor._id);
      await makeCoupon(vendor._id, { code: "AUDIO", appliesToProducts: [product._id] });

      const lines = [scopedLine(100, { productId: String(product._id) })];
      await expect(
        validateCoupon(String(vendor._id), "AUDIO", 100, { lines }),
      ).resolves.toBeTruthy();
    });

    it("rejects a scoped coupon that reaches nothing in the cart", async () => {
      const vendor = await makeVendor();
      const [targeted, other] = await Promise.all([
        makeProduct(vendor._id),
        makeProduct(vendor._id),
      ]);
      await makeCoupon(vendor._id, { code: "AUDIO", appliesToProducts: [targeted._id] });

      const lines = [scopedLine(100, { productId: String(other._id) })];
      await expect(
        validateCoupon(String(vendor._id), "AUDIO", 100, { lines }),
      ).rejects.toThrow(/does not apply/i);
    });

    it("matches on category as well as product", async () => {
      const vendor = await makeVendor();
      // A real category id: the schema stores these as ObjectIds, and the line
      // carries the same id (as a string) the way a priced cart line would.
      const categoryId = new Types.ObjectId();
      await makeCoupon(vendor._id, { code: "HOME", appliesToCategories: [categoryId] });

      const lines = [scopedLine(100, { productId: "x", categories: [String(categoryId)] })];
      await expect(
        validateCoupon(String(vendor._id), "HOME", 100, { lines }),
      ).resolves.toBeTruthy();
    });
  });

  describe("per-user limit", () => {
    it("rejects a shopper who has reached their limit", async () => {
      const [vendor, user] = await Promise.all([makeVendor(), makeUser()]);
      await makeCoupon(vendor._id, { code: "ONCE", perUserLimit: 1 });
      await redemption(String(vendor._id), String(user._id), "ONCE");

      await expect(
        validateCoupon(String(vendor._id), "ONCE", 100, { userId: String(user._id) }),
      ).rejects.toThrow(/already used/i);
    });

    it("still accepts a shopper with a redemption left", async () => {
      const [vendor, user] = await Promise.all([makeVendor(), makeUser()]);
      await makeCoupon(vendor._id, { code: "TWICE", perUserLimit: 2 });
      await redemption(String(vendor._id), String(user._id), "TWICE");

      await expect(
        validateCoupon(String(vendor._id), "TWICE", 100, { userId: String(user._id) }),
      ).resolves.toBeTruthy();
    });

    it("does not count a cancelled order against the limit", async () => {
      const [vendor, user] = await Promise.all([makeVendor(), makeUser()]);
      await makeCoupon(vendor._id, { code: "ONCE", perUserLimit: 1 });
      await redemption(String(vendor._id), String(user._id), "ONCE", "cancelled");

      await expect(
        validateCoupon(String(vendor._id), "ONCE", 100, { userId: String(user._id) }),
      ).resolves.toBeTruthy();
    });

    it("does not enforce a per-user limit for a guest (no user id)", async () => {
      const [vendor, user] = await Promise.all([makeVendor(), makeUser()]);
      await makeCoupon(vendor._id, { code: "ONCE", perUserLimit: 1 });
      // Even with a redemption on record, a guest checkout has no identity to
      // count, so the limit cannot apply.
      await redemption(String(vendor._id), String(user._id), "ONCE");

      await expect(validateCoupon(String(vendor._id), "ONCE", 100)).resolves.toBeTruthy();
    });

    it("scopes the count to this coupon and this shopper", async () => {
      const [vendor, user, other] = await Promise.all([makeVendor(), makeUser(), makeUser()]);
      await makeCoupon(vendor._id, { code: "MINE", perUserLimit: 1 });
      // Another shopper's redemption of the same code must not lock this one out.
      await redemption(String(vendor._id), String(other._id), "MINE");

      await expect(
        validateCoupon(String(vendor._id), "MINE", 100, { userId: String(user._id) }),
      ).resolves.toBeTruthy();
    });
  });
});

/**
 * The cart preview and the checkout that charges the customer must agree about
 * whether a coupon applies.
 *
 * The preview used to match on `isActive` alone, so each of these cases showed
 * a discount on the cart page that checkout then refused — the customer saw a
 * total, clicked pay, and was told the coupon was invalid.
 */
describe("resolveCouponForPreview", () => {
  it("returns the coupon when it is genuinely valid", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "GOOD" });

    const found = await resolveCouponForPreview(String(vendor._id), "GOOD", [line(100)]);
    expect(found?.code).toBe("GOOD");
  });

  it("is null when the cart has no coupon", async () => {
    const vendor = await makeVendor();
    expect(await resolveCouponForPreview(String(vendor._id), null, [line(100)])).toBeNull();
  });

  it("drops an expired coupon instead of previewing a discount", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "GONE", expiresAt: new Date(Date.now() - 60_000) });

    expect(await resolveCouponForPreview(String(vendor._id), "GONE", [line(100)])).toBeNull();
  });

  it("drops a coupon that has reached its usage limit", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "MAXED", usageLimit: 1, usedCount: 1 });

    expect(await resolveCouponForPreview(String(vendor._id), "MAXED", [line(100)])).toBeNull();
  });

  /**
   * The case that needs the subtotal, and the reason this takes the lines
   * rather than a resolved coupon: a cart that qualified when the coupon was
   * applied can drop below the minimum when an item is removed.
   */
  it("drops a coupon once the cart falls below its minimum spend", async () => {
    const vendor = await makeVendor();
    await makeCoupon(vendor._id, { code: "BIG", minSpend: 50 });

    expect(await resolveCouponForPreview(String(vendor._id), "BIG", [line(60)])).toBeTruthy();
    expect(await resolveCouponForPreview(String(vendor._id), "BIG", [line(40)])).toBeNull();
  });

  it("drops another vendor's coupon", async () => {
    const [mine, theirs] = await Promise.all([makeVendor(), makeVendor()]);
    await makeCoupon(theirs._id, { code: "SHARED" });

    expect(await resolveCouponForPreview(String(mine._id), "SHARED", [line(100)])).toBeNull();
  });

  /**
   * The agreement stated directly: for the same cart, whatever the preview
   * shows a discount for is exactly what checkout accepts.
   */
  it("agrees with validateCoupon on every outcome", async () => {
    const vendor = await makeVendor();
    const vendorId = String(vendor._id);
    const lines = [line(100)];

    await makeCoupon(vendor._id, { code: "OK" });
    await makeCoupon(vendor._id, { code: "DEAD", expiresAt: new Date(Date.now() - 60_000) });
    await makeCoupon(vendor._id, { code: "STEEP", minSpend: 500 });

    for (const code of ["OK", "DEAD", "STEEP", "MISSING"]) {
      const previewed = await resolveCouponForPreview(vendorId, code, lines);
      const accepted = await validateCoupon(vendorId, code, 100).then(
        () => true,
        () => false,
      );
      expect(previewed !== null).toBe(accepted);
    }
  });
});
