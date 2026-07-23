import { describe, it, expect } from "vitest";
import { couponService } from "@/server/services/coupon.service";
import { validateCoupon } from "@/server/services/pricing.service";
import { Coupon } from "@/server/database/models/coupon.model";
import type { CouponInput } from "@/features/coupons/schemas";
import { makeVendor, makeUser } from "./factories";

/**
 * Vendor coupon authoring.
 *
 * The service takes input already parsed by `couponInputSchema` (code upper,
 * defaults filled), so these build that shape directly. The interesting cases
 * are the ones the unique `{vendor, code}` index makes sharp: a duplicate code,
 * a code revived after deletion, and the tenant boundary — one vendor's code
 * must not block another's.
 */

function input(overrides: Partial<CouponInput> = {}): CouponInput {
  return {
    code: "SUMMER",
    description: null,
    type: "percentage",
    value: 10,
    minSpend: 0,
    maxDiscount: null,
    usageLimit: null,
    perUserLimit: null,
    appliesToProducts: [],
    appliesToCategories: [],
    startsAt: null,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

async function actor() {
  return makeUser();
}

describe("creating a coupon", () => {
  it("creates it with the given fields", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);

    const coupon = await couponService.create(
      String(vendor._id),
      input({ code: "WELCOME10", value: 10 }),
      String(user._id),
    );

    expect(coupon.code).toBe("WELCOME10");
    expect(coupon.type).toBe("percentage");
    expect(String(coupon.vendor)).toBe(String(vendor._id));
  });

  it("refuses a code already in use on the vendor", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);
    await couponService.create(String(vendor._id), input({ code: "DUP" }), String(user._id));

    await expect(
      couponService.create(String(vendor._id), input({ code: "DUP" }), String(user._id)),
    ).rejects.toThrow(/already exists/i);
  });

  /** Same code on two different vendors is fine — coupons are vendor-scoped. */
  it("allows the same code on a different vendor", async () => {
    const [a, b, user] = await Promise.all([makeVendor(), makeVendor(), actor()]);
    await couponService.create(String(a._id), input({ code: "SHARED" }), String(user._id));

    await expect(
      couponService.create(String(b._id), input({ code: "SHARED" }), String(user._id)),
    ).resolves.toBeTruthy();
  });

  /**
   * The unique index counts soft-deleted rows, so re-creating a deleted code
   * must revive that row rather than collide on the index.
   */
  it("revives a previously deleted code instead of colliding", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);
    const vendorId = String(vendor._id);

    const first = await couponService.create(vendorId, input({ code: "BACK", value: 10 }), String(user._id));
    await Coupon.updateOne({ _id: first._id }, { $set: { usedCount: 5 } });
    await couponService.remove(vendorId, String(first._id), String(user._id));

    const revived = await couponService.create(vendorId, input({ code: "BACK", value: 25 }), String(user._id));

    expect(revived.value).toBe(25);
    expect(revived.usedCount).toBe(0); // a revived coupon starts its count fresh
    expect(revived.deletedAt).toBeNull();
    // No orphan: the revived row is the same one, not a second document.
    expect(await Coupon.countDocuments({ vendor: vendorId, code: "BACK" })).toBe(1);
  });
});

describe("updating a coupon", () => {
  it("changes its fields", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);
    const vendorId = String(vendor._id);
    const coupon = await couponService.create(vendorId, input({ code: "EDIT", value: 10 }), String(user._id));

    const updated = await couponService.update(
      vendorId,
      String(coupon._id),
      input({ code: "EDIT", value: 20, type: "percentage" }),
      String(user._id),
    );

    expect(updated.value).toBe(20);
  });

  it("refuses renaming onto another active code", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);
    const vendorId = String(vendor._id);
    await couponService.create(vendorId, input({ code: "TAKEN" }), String(user._id));
    const other = await couponService.create(vendorId, input({ code: "FREE" }), String(user._id));

    await expect(
      couponService.update(vendorId, String(other._id), input({ code: "TAKEN" }), String(user._id)),
    ).rejects.toThrow(/already exists/i);
  });

  it("does not touch another vendor's coupon", async () => {
    const [mine, theirs, user] = await Promise.all([makeVendor(), makeVendor(), actor()]);
    const coupon = await couponService.create(String(theirs._id), input({ code: "THEIRS" }), String(user._id));

    await expect(
      couponService.update(String(mine._id), String(coupon._id), input({ code: "THEIRS" }), String(user._id)),
    ).rejects.toThrow(/not found/i);
  });
});

describe("deleting a coupon", () => {
  it("stops it validating at checkout and drops it from the list", async () => {
    const [vendor, user] = await Promise.all([makeVendor(), actor()]);
    const vendorId = String(vendor._id);
    const coupon = await couponService.create(vendorId, input({ code: "GONE" }), String(user._id));

    // Valid before deletion.
    await expect(validateCoupon(vendorId, "GONE", 100)).resolves.toBeTruthy();

    await couponService.remove(vendorId, String(coupon._id), String(user._id));

    await expect(validateCoupon(vendorId, "GONE", 100)).rejects.toThrow(/invalid/i);
    expect(await couponService.list(vendorId)).toHaveLength(0);
  });
});

describe("listing coupons", () => {
  it("returns only this vendor's, newest first", async () => {
    const [mine, theirs, user] = await Promise.all([makeVendor(), makeVendor(), actor()]);
    await couponService.create(String(theirs._id), input({ code: "THEIRS" }), String(user._id));
    await couponService.create(String(mine._id), input({ code: "FIRST" }), String(user._id));
    await couponService.create(String(mine._id), input({ code: "SECOND" }), String(user._id));

    const list = await couponService.list(String(mine._id));
    const codes = list.map((c) => c.code);

    expect(codes).toEqual(["SECOND", "FIRST"]);
    expect(codes).not.toContain("THEIRS");
  });
});
