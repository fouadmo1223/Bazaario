import { connectToDatabase } from "@/server/database/connection";
import { User, type UserDoc } from "@/server/database/models/user.model";
import { ROLES } from "@/shared/constants/rbac";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";

/**
 * Platform-wide account status — distinct from `vendorStaffService.suspend`,
 * which only revokes one vendor's membership. A ban sets `User.status`, which
 * `authService.login` already checks and rejects, so it locks the account out
 * everywhere, not just off one store's staff list.
 */
export const userAdminService = {
  async ban(userId: string, actorId: string): Promise<UserDoc> {
    await connectToDatabase();
    if (userId === actorId) throw Errors.badRequest("You cannot ban your own account");

    const user = await User.findById(userId);
    if (!user) throw Errors.notFound("User not found");
    if (user.roles.includes(ROLES.SUPER_ADMIN)) {
      throw Errors.forbidden("Cannot ban another super admin");
    }

    user.status = "suspended";
    user.set("updatedBy", actorId);
    await user.save();

    await writeAudit({ actor: actorId, action: "user.ban", entity: "User", entityId: userId });
    return user;
  },

  async unban(userId: string, actorId: string): Promise<UserDoc> {
    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) throw Errors.notFound("User not found");

    user.status = "active";
    user.set("updatedBy", actorId);
    await user.save();

    await writeAudit({ actor: actorId, action: "user.unban", entity: "User", entityId: userId });
    return user;
  },
};
