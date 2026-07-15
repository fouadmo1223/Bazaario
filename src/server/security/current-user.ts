import { cache } from "react";
import { readAccessCookie } from "./session";
import { verifyAccessToken, type AccessClaims } from "./tokens";
import { Errors } from "@/shared/lib/errors";
import {
  ROLES,
  type Role,
  type Permission,
  roleHasPermission,
} from "@/shared/constants/rbac";
import { connectToDatabase } from "@/server/database/connection";
import { Membership } from "@/server/database/models/membership.model";

export type CurrentUser = {
  id: string;
  email: string;
  roles: Role[];
};

/**
 * Resolve the authenticated user from the access-token cookie.
 * Wrapped in React `cache` so it runs once per request across RSC/actions.
 * Returns null when unauthenticated (does not throw).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readAccessCookie();
  if (!token) return null;
  try {
    const claims: AccessClaims = verifyAccessToken(token);
    return { id: claims.sub, email: claims.email, roles: claims.roles };
  } catch {
    return null;
  }
});

/** Like getCurrentUser but throws UNAUTHORIZED when there is no session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw Errors.unauthorized();
  return user;
}

/** Assert the user holds a global permission (super_admin / customer scope). */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = user.roles.some((r) => roleHasPermission(r, permission));
  if (!allowed) throw Errors.forbidden();
  return user;
}

/** Assert super admin. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.roles.includes(ROLES.SUPER_ADMIN)) throw Errors.forbidden();
  return user;
}

/**
 * Assert the user may act on a specific market with the given permission.
 * Super admin bypasses the membership check. Everyone else must have an active
 * membership on that market whose role (or explicit grant) covers the permission.
 * This is the core tenant-isolation guard.
 */
export async function requireMarketPermission(
  marketId: string,
  permission: Permission,
): Promise<{ user: CurrentUser; role: Role }> {
  const user = await requireUser();

  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    return { user, role: ROLES.SUPER_ADMIN };
  }

  await connectToDatabase();
  const membership = await Membership.findOne({
    user: user.id,
    market: marketId,
    status: "active",
  });
  if (!membership) throw Errors.forbidden("You do not have access to this market");

  const role = membership.role as Role;
  const granted =
    roleHasPermission(role, permission) ||
    (membership.permissions as Permission[]).includes(permission);
  if (!granted) throw Errors.forbidden();

  return { user, role };
}
