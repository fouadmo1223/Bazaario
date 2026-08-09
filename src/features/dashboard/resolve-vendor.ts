import "server-only";
import { connectToDatabase } from "@/server/database/connection";
import { Membership } from "@/server/database/models/membership.model";
import { Vendor, type VendorDoc } from "@/server/database/models/vendor.model";
import { requireUser } from "@/server/security/current-user";
import { getVendorOverride } from "@/features/platform/vendor-switch";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { Errors } from "@/shared/lib/errors";

/**
 * Resolve which vendor the current staff user operates in.
 * Super admins may target any vendor via `vendorId`, or via the switcher's
 * cookie override when no explicit id is given; everyone else is bound to
 * their active Membership. This is the entry point for every dashboard page.
 */
export async function resolveActiveVendor(
  vendorId?: string,
): Promise<{ vendor: VendorDoc; role: Role }> {
  const user = await requireUser();
  await connectToDatabase();

  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    const targetId = vendorId ?? (await getVendorOverride());
    const vendor = targetId
      ? await Vendor.findOne({ _id: targetId, status: { $ne: "deleted" } })
      : await Vendor.findOne({ status: "active" });
    if (!vendor) throw Errors.notFound("No vendor found");
    return { vendor, role: ROLES.SUPER_ADMIN };
  }

  const membership = await Membership.findOne({
    user: user.id,
    status: "active",
    ...(vendorId ? { vendor: vendorId } : {}),
  });
  if (!membership) throw Errors.forbidden("You do not have access to a vendor dashboard");

  const vendor = await Vendor.findById(membership.vendor);
  if (!vendor) throw Errors.notFound("Vendor not found");
  if (vendor.status === "suspended") throw Errors.forbidden("This vendor is suspended");

  return { vendor, role: membership.role as Role };
}
