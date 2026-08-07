import { connectToDatabase } from "@/server/database/connection";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { Address, type AddressDoc } from "@/server/database/models/address.model";
import { Errors } from "@/shared/lib/errors";
import { isOwnAvatarUrl } from "@/server/storage/cloudinary";
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
   * Remembers which locale this account last used, so server-generated
   * content created with no request to read a cookie from (a chat
   * notification's title, for instance) can still go out in the right
   * language. Best-effort — never worth failing a page over.
   */
  async updateLocale(userId: string, locale: string): Promise<void> {
    await connectToDatabase();
    await User.updateOne({ _id: userId }, { $set: { locale } });
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

    /**
     * An avatar must be one this user uploaded — or the one they already have.
     *
     * The upload endpoint signs a `public_id` derived from the session, so the
     * browser cannot write anywhere else. But this action takes a *URL*, and a
     * server action is reachable by direct POST, so without this check the
     * stored value is whatever string someone sends. That matters because the
     * value is rendered through `next/image`, whose optimizer will fetch any
     * host it is handed — turning a profile field into a request proxy.
     *
     * The "already have" clause exists for Google sign-in: those avatars are on
     * `lh3.googleusercontent.com`, set by the OAuth callback rather than
     * uploaded here. Without it, a Google user who edited their name would have
     * their avatar rejected for being exactly what it already was.
     */
    if (input.avatar) {
      const current = await User.findById(userId).select("avatar").lean();
      const unchanged = current?.avatar === input.avatar;
      if (!unchanged && !isOwnAvatarUrl(input.avatar, userId)) {
        throw Errors.badRequest("Upload an image instead of linking to one.");
      }
    }

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

  /**
   * Set or clear just the avatar.
   *
   * Separate from `update` because the avatar is saved the instant an upload
   * finishes, not when the form is submitted. Reusing `update` would mean
   * sending the name and phone along with it — and whatever was in those inputs
   * mid-edit would be committed as a side effect of picking a photo.
   */
  async setAvatar(userId: string, avatar: string | null): Promise<UserDoc> {
    await connectToDatabase();

    if (avatar && !isOwnAvatarUrl(avatar, userId)) {
      throw Errors.badRequest("Upload an image instead of linking to one.");
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { avatar, updatedBy: userId } },
      { returnDocument: "after" },
    );
    if (!user) throw Errors.notFound("Account not found");

    await writeAudit({
      actor: userId,
      action: avatar ? "profile.avatar.set" : "profile.avatar.clear",
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
