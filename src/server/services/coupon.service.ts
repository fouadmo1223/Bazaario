import { connectToDatabase } from "@/server/database/connection";
import { Coupon, type CouponDoc } from "@/server/database/models/coupon.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";
import type { CouponInput } from "@/features/coupons/schemas";

/**
 * Coupon management for the vendor dashboard.
 *
 * Every operation is vendor-scoped — the caller must already have passed
 * `requireVendorPermission(vendorId, COUPON_WRITE)`. Redemption-time validation
 * (windows, limits, scope) lives in `pricing.service`; this is only authoring.
 */
export const couponService = {
  /** All of a vendor's coupons, newest first. Soft-deleted ones are excluded. */
  async list(vendorId: string): Promise<CouponDoc[]> {
    await connectToDatabase();
    return Coupon.find({ vendor: vendorId }).sort({ createdAt: -1 }).exec();
  },

  async getById(vendorId: string, couponId: string): Promise<CouponDoc> {
    await connectToDatabase();
    const coupon = await Coupon.findOne({ _id: couponId, vendor: vendorId });
    if (!coupon) throw Errors.notFound("Coupon not found");
    return coupon;
  },

  /**
   * Create a coupon, or revive one whose code was previously deleted.
   *
   * The `{vendor, code}` unique index counts soft-deleted rows, so a plain insert
   * of a code a vendor once deleted would fail on the index. Reviving that row
   * instead — with the new values and a reset usage count — is what a vendor
   * means by "make this code again", and keeps the friendly-error path for a code
   * that is genuinely still in use.
   */
  async create(vendorId: string, input: CouponInput, actorId: string): Promise<CouponDoc> {
    await connectToDatabase();

    const existing = await Coupon.findOne({ vendor: vendorId, code: input.code }).setOptions({
      withDeleted: true,
    });
    if (existing && existing.deletedAt == null) {
      throw Errors.conflict("A coupon with that code already exists");
    }

    let coupon: CouponDoc;
    if (existing) {
      Object.assign(existing, input, { deletedAt: null, usedCount: 0, updatedBy: actorId });
      coupon = await existing.save();
    } else {
      coupon = await Coupon.create({ ...input, vendor: vendorId, createdBy: actorId });
    }

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "coupon.create",
      entity: "Coupon",
      entityId: String(coupon._id),
      diff: { code: coupon.code, type: coupon.type, value: coupon.value },
    });
    return coupon;
  },

  async update(
    vendorId: string,
    couponId: string,
    input: CouponInput,
    actorId: string,
  ): Promise<CouponDoc> {
    await connectToDatabase();
    const coupon = await Coupon.findOne({ _id: couponId, vendor: vendorId });
    if (!coupon) throw Errors.notFound("Coupon not found");

    if (input.code !== coupon.code) {
      const clash = await Coupon.findOne({
        vendor: vendorId,
        code: input.code,
        _id: { $ne: couponId },
      });
      if (clash) throw Errors.conflict("A coupon with that code already exists");
    }

    Object.assign(coupon, input, { updatedBy: actorId });
    await coupon.save();

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "coupon.update",
      entity: "Coupon",
      entityId: couponId,
    });
    return coupon;
  },

  /**
   * Soft-delete a coupon. Orders keep the code as a plain string, so their
   * history is untouched; checkout stops honouring it because `validateCoupon`
   * reads through the default filter that excludes deleted rows.
   */
  async remove(vendorId: string, couponId: string, actorId: string): Promise<void> {
    await connectToDatabase();
    const coupon = await Coupon.findOne({ _id: couponId, vendor: vendorId });
    if (!coupon) throw Errors.notFound("Coupon not found");
    Object.assign(coupon, { deletedAt: new Date(), updatedBy: actorId });
    await coupon.save();

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "coupon.delete",
      entity: "Coupon",
      entityId: couponId,
    });
  },
};
