"use server";

import { revalidatePath } from "next/cache";
import { vendorService, updateVendorSettingsSchema } from "@/server/services/vendor.service";
import { Vendor } from "@/server/database/models/vendor.model";
import { connectToDatabase } from "@/server/database/connection";
import { requireVendorPermission } from "@/server/security/current-user";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { ok, toFailure, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";

export async function updateVendorSettingsAction(
  vendorId: string,
  input: unknown,
): Promise<ApiResult<null>> {
  try {
    const { user } = await requireVendorPermission(vendorId, PERMISSIONS.CMS_WRITE);
    const parsed = updateVendorSettingsSchema.safeParse(input);
    if (!parsed.success) throw Errors.validation("Invalid settings", parsed.error.flatten());

    await vendorService.updateSettings(vendorId, parsed.data, user.id);

    revalidatePath("/dashboard/settings");
    await connectToDatabase();
    const vendor = await Vendor.findById(vendorId).select("slug");
    if (vendor) revalidatePath(`/v/${vendor.slug}`);
    revalidatePath("/");

    return ok(null, { message: "Settings saved." });
  } catch (err) {
    return toFailure(err);
  }
}
