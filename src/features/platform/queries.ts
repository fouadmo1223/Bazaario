import { connectToDatabase } from "@/server/database/connection";
import { Vendor } from "@/server/database/models/vendor.model";
import { Membership } from "@/server/database/models/membership.model";
import type { Role } from "@/shared/constants/rbac";

/**
 * Read models for the platform console.
 *
 * Everything is mapped to plain serializable values before it leaves here.
 * Mongoose documents must not cross into Client Components, and `cached()`
 * rejects them at compile time for the same reason — a JSON round trip renames
 * `_id` to `id`, so a cached read and an uncached one differ in shape.
 */

export type VendorOption = { id: string; name: string; slug: string; status: string };

export type StaffMember = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  isOwner: boolean;
};

export type VendorStaff = {
  vendor: VendorOption;
  staff: StaffMember[];
};

export async function listVendorOptions(): Promise<VendorOption[]> {
  await connectToDatabase();
  const vendors = await Vendor.find({}).select("name slug status").sort({ name: 1 }).lean();

  return vendors.map((v) => ({
    id: String(v._id),
    name: v.name,
    slug: v.slug,
    status: v.status,
  }));
}

/**
 * Every vendor with its staff, for the console's single screen.
 *
 * Two queries rather than one per vendor: the memberships are fetched in one
 * go and grouped in memory, so adding a hundredth vendor does not add a
 * hundredth round trip.
 */
export async function listVendorsWithStaff(): Promise<VendorStaff[]> {
  await connectToDatabase();

  const vendors = await Vendor.find({}).select("name slug status owner").sort({ name: 1 }).lean();

  const memberships = await Membership.find({
    vendor: { $in: vendors.map((v) => v._id) },
  })
    .populate<{ user: { _id: unknown; name: string; email: string } | null }>(
      "user",
      "name email",
    )
    .sort({ createdAt: -1 })
    .lean();

  const byVendor = new Map<string, StaffMember[]>();
  for (const m of memberships) {
    // A membership whose user was hard-deleted would populate to null; skip it
    // rather than render a row with no name.
    if (!m.user) continue;

    const vendorId = String(m.vendor);
    const list = byVendor.get(vendorId) ?? [];
    list.push({
      userId: String(m.user._id),
      membershipId: String(m._id),
      name: m.user.name,
      email: m.user.email,
      role: m.role as Role,
      status: m.status,
      isOwner: false,
    });
    byVendor.set(vendorId, list);
  }

  return vendors.map((v) => {
    const owner = String(v.owner);
    return {
      vendor: { id: String(v._id), name: v.name, slug: v.slug, status: v.status },
      staff: (byVendor.get(String(v._id)) ?? []).map((s) => ({
        ...s,
        isOwner: s.userId === owner,
      })),
    };
  });
}
