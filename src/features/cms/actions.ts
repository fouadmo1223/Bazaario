"use server";

import { revalidatePath } from "next/cache";
import { bannerService } from "@/server/services/banner.service";
import { Vendor } from "@/server/database/models/vendor.model";
import { connectToDatabase } from "@/server/database/connection";
import { requireVendorPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { bannerInputSchema } from "./schemas";
import type { BannerDoc } from "@/server/database/models/banner.model";

function serialize(b: BannerDoc) {
  return JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
}

/** Storefront pages are ISR-cached; a banner change needs to bust that. */
async function revalidateStorefront(vendorId: string) {
  await connectToDatabase();
  const vendor = await Vendor.findById(vendorId).select("slug");
  if (vendor) revalidatePath(`/v/${vendor.slug}`);
}

export async function createBannerAction(
  vendorId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.CMS_WRITE);
    const parsed = bannerInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid banner", parsed.error.flatten());

    const banner = await bannerService.create(vendorId, parsed.data, user.id);
    revalidatePath("/dashboard/banners");
    await revalidateStorefront(vendorId);
    return ok(serialize(banner), { message: "Banner created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function updateBannerAction(
  vendorId: string,
  bannerId: string,
  input: unknown,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.CMS_WRITE);
    const parsed = bannerInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid banner", parsed.error.flatten());

    const banner = await bannerService.update(vendorId, bannerId, parsed.data, user.id);
    revalidatePath("/dashboard/banners");
    await revalidateStorefront(vendorId);
    return ok(serialize(banner), { message: "Banner updated." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function deleteBannerAction(
  vendorId: string,
  bannerId: string,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.CMS_WRITE);
    await bannerService.remove(vendorId, bannerId, user.id);
    revalidatePath("/dashboard/banners");
    await revalidateStorefront(vendorId);
    return ok(null, { message: "Banner deleted." });
  } catch (err) {
    return toFailure(err);
  }
}
