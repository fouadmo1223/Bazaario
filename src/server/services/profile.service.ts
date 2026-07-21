import { connectToDatabase } from "@/server/database/connection";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { Address, type AddressDoc } from "@/server/database/models/address.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";

/**
 * A user's own account details.
 *
 * Every method takes the acting user's id and scopes to it — there is no
 * "update any user" entry point here, so a mistyped id cannot reach someone
 * else's record. Administrative user management, if it is ever built, belongs
 * in its own service with its own guard.
 */

export type ProfileInput = {
  name: string;
  phone?: string | null;
  avatar?: string | null;
};

export type AddressInput = {
  label?: string;
  recipient: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault?: boolean;
};

export const profileService = {
  async get(userId: string): Promise<UserDoc> {
    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) throw Errors.notFound("Account not found");
    return user;
  },

  /**
   * Update the fields a user owns.
   *
   * Deliberately narrow: `email`, `roles`, and `status` are not accepted. Email
   * is an identity change that needs re-verification, and the other two are
   * privilege — accepting a whole object here is how a profile form quietly
   * becomes a way to grant yourself `super_admin`.
   */
  async update(userId: string, input: ProfileInput): Promise<UserDoc> {
    await connectToDatabase();
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          name: input.name,
          phone: input.phone ?? null,
          avatar: input.avatar ?? null,
          updatedBy: userId,
        },
      },
      { returnDocument: "after" },
    );
    if (!user) throw Errors.notFound("Account not found");

    await writeAudit({
      actor: userId,
      action: "profile.update",
      entity: "User",
      entityId: userId,
    });
    return user;
  },

  async listAddresses(userId: string): Promise<AddressDoc[]> {
    await connectToDatabase();
    return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 }).exec();
  },

  /**
   * Exactly one address is the default.
   *
   * The unset runs before the insert, and is scoped to this user, so two
   * addresses can never both claim it — a checkout that picks "the default"
   * would otherwise depend on document order.
   */
  async addAddress(userId: string, input: AddressInput): Promise<AddressDoc> {
    await connectToDatabase();
    const existingCount = await Address.countDocuments({ user: userId });

    // The first address a user saves is their default whether they said so or
    // not; otherwise their first checkout has nothing preselected.
    const isDefault = input.isDefault || existingCount === 0;
    if (isDefault) {
      await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    }

    return Address.create({ ...input, user: userId, isDefault, createdBy: userId });
  },

  async updateAddress(userId: string, addressId: string, input: AddressInput): Promise<AddressDoc> {
    await connectToDatabase();
    if (input.isDefault) {
      await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    }

    // Scoped by user as well as id: an id alone would let anyone edit anyone's.
    const address = await Address.findOneAndUpdate(
      { _id: addressId, user: userId },
      { $set: { ...input, isDefault: input.isDefault ?? false, updatedBy: userId } },
      { returnDocument: "after" },
    );
    if (!address) throw Errors.notFound("Address not found");
    return address;
  },

  async deleteAddress(userId: string, addressId: string): Promise<void> {
    await connectToDatabase();
    const address = await Address.findOneAndDelete({ _id: addressId, user: userId });
    if (!address) throw Errors.notFound("Address not found");

    // Deleting the default promotes the next one, so the user is never left
    // with addresses but nothing preselected at checkout.
    if (address.isDefault) {
      const next = await Address.findOne({ user: userId }).sort({ createdAt: -1 });
      if (next) await Address.updateOne({ _id: next._id }, { $set: { isDefault: true } });
    }
  },

  async setDefaultAddress(userId: string, addressId: string): Promise<void> {
    await connectToDatabase();
    const owned = await Address.findOne({ _id: addressId, user: userId }).select("_id");
    if (!owned) throw Errors.notFound("Address not found");

    await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
    await Address.updateOne({ _id: addressId }, { $set: { isDefault: true } });
  },
};
