"use server";

import { revalidatePath } from "next/cache";
import { couponService } from "@/server/services/coupon.service";
import { requireVendorPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { couponInputSchema } from "./schemas";
import type { CouponDoc } from "@/server/database/models/coupon.model";

function serialize(c: CouponDoc) {
  return JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
}

export async function createCouponAction(
  vendorId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.COUPON_WRITE);
    const parsed = couponInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid coupon", parsed.error.flatten());

    const coupon = await couponService.create(vendorId, parsed.data, user.id);
    revalidatePath("/dashboard/coupons");
    return ok(serialize(coupon), { message: "Coupon created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateCouponAction(
  vendorId: string,
  couponId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.COUPON_WRITE);
    const parsed = couponInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid coupon", parsed.error.flatten());

    const coupon = await couponService.update(vendorId, couponId, parsed.data, user.id);
    revalidatePath("/dashboard/coupons");
    return ok(serialize(coupon), { message: "Coupon updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteCouponAction(
  vendorId: string,
  couponId: string,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.COUPON_WRITE);
    await couponService.remove(vendorId, couponId, user.id);
    revalidatePath("/dashboard/coupons");
    return ok(null, { message: "Coupon deleted." });
  } catch (err) {
    return toFailure(err);
  }
}
