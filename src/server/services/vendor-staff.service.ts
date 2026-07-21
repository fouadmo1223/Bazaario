import { z } from "zod";
import { connectToDatabase } from "@/server/database/connection";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { Membership, type MembershipDoc } from "@/server/database/models/membership.model";
import { hashPassword } from "@/server/security/password";
import { Errors } from "@/shared/lib/errors";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { logger } from "@/shared/lib/logger";
import { writeAudit } from "./audit.service";

/**
 * Staffing a vendor — Super Admin only (authorization enforced by the caller).
 *
 * `vendorService.create` requires its owner to already exist ("they must
 * register first"), which left no way to stand up a vendor's team: an admin had
 * to ask each person to register through the storefront first. This closes that
 * gap by creating the user when there isn't one.
 *
 * The membership *role* is vendor-scoped and separate from the global
 * `user.roles`. A user keeps `customer` globally and gains, say, `support` on
 * one vendor; the guard that matters is `requireVendorPermission`, which reads
 * the membership, not the global list.
 */

/**
 * Only the four roles a Membership accepts.
 *
 * `customer` and `super_admin` are global and meaningless inside a vendor — the
 * schema rejects them, and a super admin handing out `super_admin` through a
 * vendor staff form would be a privilege-escalation path rather than a typo.
 */
export const MEMBERSHIP_ROLES = [
  ROLES.VENDOR,
  ROLES.MARKETING,
  ROLES.SUPPORT,
  ROLES.DELIVERY_DRIVER,
] as const;

export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Mirrors `registerSchema`'s rules — an admin-set password is still a password. */
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[0-9]/, "Must include a number");

export const createVendorUserSchema = z.object({
  vendorId: z.string().regex(/^[a-f\d]{24}$/i, "Choose a vendor"),
  email: z.string().email("Enter a valid email").toLowerCase().trim(),
  name: z.string().trim().min(2, "Name is too short").max(80),
  role: z.enum(MEMBERSHIP_ROLES),
  /**
   * Optional because an existing user keeps the password they already chose.
   * Required for a new one — checked in the service, which knows which case it
   * is, rather than here where it would need a second round trip to find out.
   */
  password: password.optional(),
  phone: z.string().trim().max(30).optional(),
});

export type CreateVendorUserInput = z.infer<typeof createVendorUserSchema>;

export type CreateVendorUserResult = {
  user: UserDoc;
  membership: MembershipDoc;
  /** True when this call created the account, false when it attached an existing one. */
  created: boolean;
};

export const vendorStaffService = {
  /**
   * Give someone a role on a vendor, creating their account if they have none.
   *
   * Both paths are here deliberately. An admin typing an email does not
   * reliably know whether that person already shops on the marketplace, and
   * failing with "already registered" would leave them with no way forward —
   * the existing user is exactly who they meant.
   */
  async createOrAttach(
    input: CreateVendorUserInput,
    actorId: string,
  ): Promise<CreateVendorUserResult> {
    await connectToDatabase();

    /**
     * Re-check the role here, not only in the schema.
     *
     * This is the escalation guard, and it has to be at the service boundary
     * because the service is exported and the schema is not the only way in.
     * Below, an unrecognised role would be pushed onto `user.roles` — the
     * *global* list — so passing `super_admin` here would grant it platform
     * wide. Mongoose does not save us: enum validators do not run on an update
     * unless asked, which is why the upsert below sets `runValidators`.
     */
    if (!MEMBERSHIP_ROLES.includes(input.role)) {
      throw Errors.badRequest(`"${input.role}" is not a vendor role`);
    }

    const vendor = await Vendor.findById(input.vendorId).select("_id name");
    if (!vendor) throw Errors.notFound("Vendor not found");

    let user = await User.findOne({ email: input.email });
    const created = !user;

    if (!user) {
      if (!input.password) {
        throw Errors.validation("Set a password for the new user", {
          fieldErrors: { password: ["A password is required for a new user"] },
        });
      }

      user = await User.create({
        email: input.email,
        name: input.name,
        phone: input.phone ?? null,
        passwordHash: await hashPassword(input.password),
        roles: [ROLES.CUSTOMER],
        status: "active",
        /**
         * Marked verified: an administrator vouching for the address is the
         * point of this flow, and leaving it unverified would gate the account
         * behind an email that cannot currently be sent (no SMTP password is
         * configured). Revisit if self-serve invites are added.
         */
        emailVerifiedAt: new Date(),
        createdBy: actorId,
      });
    }

    const userId = String(user._id);

    /**
     * One membership per user per vendor is a unique index, so re-adding
     * somebody must update rather than insert. Upserting also makes this the
     * natural way to *change* a role, and re-activates a suspended member
     * instead of failing on a duplicate key they cannot see.
     */
    const existing = await Membership.findOne({ user: userId, vendor: vendor._id });
    if (existing && existing.status === "active" && existing.role === input.role) {
      throw Errors.conflict(`${input.email} already has the ${input.role} role on this vendor`);
    }

    const membership = await Membership.findOneAndUpdate(
      { user: userId, vendor: vendor._id },
      {
        $set: { role: input.role, status: "active", invitedBy: actorId, updatedBy: actorId },
        $setOnInsert: { user: userId, vendor: vendor._id, createdBy: actorId },
      },
      // `runValidators` is off by default on updates, so without it the role
      // enum is not enforced on this path at all.
      { upsert: true, returnDocument: "after", runValidators: true },
    );

    /**
     * The global role list gains the vendor-scoped role too.
     *
     * Not for authorization — `requireVendorPermission` reads the membership,
     * and this list carries no vendor, so trusting it for access would grant
     * the role on *every* vendor. It exists so the dashboard is reachable at
     * all: the layout and `proxy.ts` decide whether to show staff navigation
     * from the token's roles, which is all the edge has to work with.
     */
    if (!user.roles.includes(input.role)) {
      user.roles.push(input.role);
      user.set("updatedBy", actorId);
      await user.save();
    }

    await writeAudit({
      actor: actorId,
      vendor: String(vendor._id),
      action: created ? "vendor.staff.create" : "vendor.staff.attach",
      entity: "User",
      entityId: userId,
      diff: { email: input.email, role: input.role, vendor: vendor.name },
    });
    logger.info(
      { userId, vendorId: String(vendor._id), role: input.role, created },
      "Vendor staff granted",
    );

    return { user, membership: membership!, created };
  },

  /** Staff on a vendor, for the management screen. */
  async list(vendorId: string): Promise<MembershipDoc[]> {
    await connectToDatabase();
    return Membership.find({ vendor: vendorId })
      .populate("user", "email name avatar status")
      .sort({ createdAt: -1 })
      .exec();
  },

  /**
   * Revoke access without deleting the account.
   *
   * Suspends rather than removes: the membership is what audit entries and
   * `invitedBy` point at, and a deleted one turns a staffed history into
   * dangling ids. It also refuses to strip the vendor's owner, who would
   * otherwise be locked out of the store they own.
   */
  async suspend(vendorId: string, userId: string, actorId: string): Promise<MembershipDoc> {
    await connectToDatabase();

    const vendor = await Vendor.findById(vendorId).select("owner");
    if (!vendor) throw Errors.notFound("Vendor not found");
    if (String(vendor.owner) === userId) {
      throw Errors.badRequest("Reassign the vendor's owner before removing their access");
    }

    const membership = await Membership.findOneAndUpdate(
      { user: userId, vendor: vendorId },
      { $set: { status: "suspended", updatedBy: actorId } },
      { returnDocument: "after" },
    );
    if (!membership) throw Errors.notFound("This user is not a member of that vendor");

    await writeAudit({
      actor: actorId,
      vendor: vendorId,
      action: "vendor.staff.suspend",
      entity: "User",
      entityId: userId,
    });
    return membership;
  },
};

export type { Role };
