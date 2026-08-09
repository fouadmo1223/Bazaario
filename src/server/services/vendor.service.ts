import { connectToDatabase } from "@/server/database/connection";
import { vendorRepository } from "@/server/repositories/vendor.repository";
import { Vendor, type VendorDoc } from "@/server/database/models/vendor.model";
import { User } from "@/server/database/models/user.model";
import { Membership } from "@/server/database/models/membership.model";
import { Errors } from "@/shared/lib/errors";
import { ROLES } from "@/shared/constants/rbac";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
import { paginationSchema, type Paginated } from "@/shared/lib/pagination";
import { z } from "zod";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export const createVendorSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(60).optional(),
  ownerEmail: z.string().email(),
  currency: z.string().length(3).optional(),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

/**
 * A vendor editing their own store's public identity — distinct from
 * `createVendorSchema`, which is the Super Admin's provisioning form and
 * carries fields (`ownerEmail`, `currency`) a vendor has no business changing
 * themselves.
 */
export const updateVendorSettingsSchema = z.object({
  name: z.string().min(2).max(80),
  nameAr: z.string().max(80).optional(),
  description: z.string().max(1000).nullable().optional(),
  descriptionAr: z.string().max(1000).nullable().optional(),
});
export type UpdateVendorSettingsInput = z.infer<typeof updateVendorSettingsSchema>;

/**
 * Vendor lifecycle — Super Admin only (authorization enforced by the caller).
 * Enforces the platform invariant: a vendor has exactly one owner, and a user
 * may own at most one vendor.
 */
export const vendorService = {
  async create(input: CreateVendorInput, actorId: string): Promise<VendorDoc> {
    await connectToDatabase();

    const owner = await User.findOne({ email: input.ownerEmail });
    if (!owner) throw Errors.notFound("Owner user not found — they must register first");

    // One vendor per admin.
    const existingOwned = await vendorRepository.findByOwner(String(owner._id));
    if (existingOwned) throw Errors.conflict("This user already owns a vendor");

    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    if (await vendorRepository.findBySlug(slug)) {
      throw Errors.conflict(`Slug "${slug}" is already taken`);
    }

    const vendor = await Vendor.create({
      name: input.name,
      slug,
      owner: owner._id,
      status: "active",
      createdBy: actorId,
      settings: input.currency ? { currency: input.currency } : {},
    });

    // Grant the owner the vendor membership + platform role.
    await Membership.create({
      user: owner._id,
      vendor: vendor._id,
      role: ROLES.VENDOR,
      status: "active",
      invitedBy: actorId,
    });
    if (!owner.roles.includes(ROLES.VENDOR)) {
      owner.roles.push(ROLES.VENDOR);
      owner.defaultVendor = vendor._id;
      await owner.save();
    }

    await writeAudit({
      actor: actorId,
      vendor: String(vendor._id),
      action: "vendor.create",
      entity: "Vendor",
      entityId: String(vendor._id),
      diff: { name: vendor.name, slug, owner: input.ownerEmail },
    });
    logger.info({ vendorId: String(vendor._id) }, "Vendor created");
    return vendor;
  },

  async suspend(vendorId: string, actorId: string, suspend: boolean): Promise<VendorDoc> {
    await connectToDatabase();
    const vendor = await vendorRepository.updateById(vendorId, {
      $set: { status: suspend ? "suspended" : "active", updatedBy: actorId },
    });
    if (!vendor) throw Errors.notFound("Vendor not found");
    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: suspend ? "vendor.suspend" : "vendor.activate",
      entity: "Vendor",
      entityId: vendorId,
    });
    return vendor;
  },

  /**
   * Soft delete — sets status rather than removing the document. Orders and
   * products still reference this vendor by id, and hard-deleting it would
   * turn every one of those into a dangling reference; `deleted` just hides
   * the store from the storefront and dashboard nav, same as `suspended`
   * does, but irreversibly by convention (no "undelete" action exists).
   */
  async delete(vendorId: string, actorId: string): Promise<VendorDoc> {
    await connectToDatabase();
    const vendor = await vendorRepository.updateById(vendorId, {
      $set: { status: "deleted", updatedBy: actorId },
    });
    if (!vendor) throw Errors.notFound("Vendor not found");
    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "vendor.delete",
      entity: "Vendor",
      entityId: vendorId,
    });
    return vendor;
  },

  async reassignAdmin(vendorId: string, newOwnerEmail: string, actorId: string): Promise<VendorDoc> {
    await connectToDatabase();
    const vendor = await vendorRepository.findById(vendorId);
    if (!vendor) throw Errors.notFound("Vendor not found");

    const newOwner = await User.findOne({ email: newOwnerEmail });
    if (!newOwner) throw Errors.notFound("New owner not found");
    if (await vendorRepository.findByOwner(String(newOwner._id))) {
      throw Errors.conflict("Target user already owns a vendor");
    }

    const previousOwner = String(vendor.owner);

    // Demote previous owner's membership, promote the new one.
    await Membership.findOneAndUpdate(
      { user: previousOwner, vendor: vendorId },
      { $set: { status: "suspended" } },
    );
    await Membership.findOneAndUpdate(
      { user: newOwner._id, vendor: vendorId },
      { $set: { role: ROLES.VENDOR, status: "active", invitedBy: actorId } },
      { upsert: true },
    );

    vendor.owner = newOwner._id;
    vendor.set("updatedBy", actorId);
    await vendor.save();

    if (!newOwner.roles.includes(ROLES.VENDOR)) {
      newOwner.roles.push(ROLES.VENDOR);
      await newOwner.save();
    }

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "vendor.reassign_admin",
      entity: "Vendor",
      entityId: vendorId,
      diff: { from: previousOwner, to: String(newOwner._id) },
    });
    return vendor;
  },

  async list(query: unknown): Promise<Paginated<VendorDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    return vendorRepository.paginate({}, pagination, { populate: "owner" });
  },

  async getBySlug(slug: string): Promise<VendorDoc> {
    await connectToDatabase();
    const vendor = await vendorRepository.findBySlug(slug);
    if (!vendor || vendor.status !== "active") throw Errors.notFound("Vendor not found");
    return vendor;
  },

  /** A vendor updating their own store's name/description (EN + AR). */
  async updateSettings(
    vendorId: string,
    input: UpdateVendorSettingsInput,
    actorId: string,
  ): Promise<VendorDoc> {
    await connectToDatabase();
    const vendor = await vendorRepository.updateById(vendorId, {
      $set: {
        name: input.name,
        nameAr: input.nameAr || null,
        description: input.description || null,
        descriptionAr: input.descriptionAr || null,
        updatedBy: actorId,
      },
    });
    if (!vendor) throw Errors.notFound("Vendor not found");
    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "vendor.settings.update",
      entity: "Vendor",
      entityId: vendorId,
    });
    return vendor;
  },
};
