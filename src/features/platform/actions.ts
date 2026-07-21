"use server";

import { vendorService, createVendorSchema } from "@/server/services/vendor.service";
import {
  vendorStaffService,
  createVendorUserSchema,
} from "@/server/services/vendor-staff.service";
import { requireSuperAdmin } from "@/server/security/current-user";
import { writeAudit } from "@/server/services/audit.service";
import { toFailure, ok, type ApiResult } from "@/shared/lib/api-response";
import { Errors } from "@/shared/lib/errors";
import { revalidatePath } from "next/cache";
import type { VendorDoc } from "@/server/database/models/vendor.model";

/** Platform (Super Admin) server actions. Every one asserts super_admin first. */

function serialize(m: VendorDoc) {
  return JSON.parse(JSON.stringify(m)) as Record<string, unknown>;
}

export async function createVendorAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = createVendorSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw Errors.validation("Check the fields", parsed.error.flatten());

    const vendor = await vendorService.create(parsed.data, admin.id);
    revalidatePath("/platform/vendors");
    return ok(serialize(vendor), { message: "Vendor created." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function suspendVendorAction(
  vendorId: string,
  suspend: boolean,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const vendor = await vendorService.suspend(vendorId, admin.id, suspend);
    revalidatePath("/platform/vendors");
    return ok(serialize(vendor));
  } catch (err) {
    return toFailure(err);
  }
}

/**
 * Give someone a role on a vendor, creating their account if they have none.
 *
 * `vendorService.create` refuses an owner who has not registered, which left no
 * way to staff a vendor: every member had to sign up through the storefront
 * first. This is the path that does not require that.
 */
export async function createVendorUserAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ created: boolean; email: string }>> {
  try {
    const admin = await requireSuperAdmin();
    const parsed = createVendorUserSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!parsed.success) throw Errors.validation("Check the fields", parsed.error.flatten());

    const result = await vendorStaffService.createOrAttach(parsed.data, admin.id);

    revalidatePath("/platform/vendors");
    return ok(
      { created: result.created, email: result.user.email },
      {
        message: result.created
          ? `Created ${result.user.email} with the ${parsed.data.role} role.`
          : `${result.user.email} already had an account — granted the ${parsed.data.role} role.`,
      },
    );
  } catch (err) {
    return toFailure(err);
  }
}

export async function suspendVendorUserAction(
  vendorId: string,
  userId: string,
): Promise<ApiResult<null>> {
  try {
    const admin = await requireSuperAdmin();
    await vendorStaffService.suspend(vendorId, userId, admin.id);
    revalidatePath("/platform/vendors");
    return ok(null, { message: "Access removed." });
  } catch (err) {
    return toFailure(err);
  }
}

export async function reassignVendorAdminAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    const admin = await requireSuperAdmin();
    const vendorId = String(formData.get("vendorId") ?? "");
    const email = String(formData.get("ownerEmail") ?? "");
    if (!vendorId || !email) throw Errors.badRequest("Vendor and new owner email are required");

    const vendor = await vendorService.reassignAdmin(vendorId, email, admin.id);
    await writeAudit({ actor: admin.id, action: "vendor.reassign_admin.request", entity: "Vendor", entityId: vendorId });
    revalidatePath("/platform/vendors");
    return ok(serialize(vendor), { message: "Vendor admin reassigned." });
  } catch (err) {
    return toFailure(err);
  }
}
