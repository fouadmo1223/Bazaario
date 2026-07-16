import "server-only";
import { connectToDatabase } from "@/server/database/connection";
import { Membership } from "@/server/database/models/membership.model";
import { Market, type MarketDoc } from "@/server/database/models/market.model";
import { requireUser } from "@/server/security/current-user";
import { ROLES, type Role } from "@/shared/constants/rbac";
import { Errors } from "@/shared/lib/errors";

/**
 * Resolve which market the current staff user operates in.
 * Super admins may target any market via `marketId`; everyone else is bound to
 * their active Membership. This is the entry point for every dashboard page.
 */
export async function resolveActiveMarket(
  marketId?: string,
): Promise<{ market: MarketDoc; role: Role }> {
  const user = await requireUser();
  await connectToDatabase();

  if (user.roles.includes(ROLES.SUPER_ADMIN)) {
    const market = marketId ? await Market.findById(marketId) : await Market.findOne({ status: "active" });
    if (!market) throw Errors.notFound("No market found");
    return { market, role: ROLES.SUPER_ADMIN };
  }

  const membership = await Membership.findOne({
    user: user.id,
    status: "active",
    ...(marketId ? { market: marketId } : {}),
  });
  if (!membership) throw Errors.forbidden("You do not have access to a market dashboard");

  const market = await Market.findById(membership.market);
  if (!market) throw Errors.notFound("Market not found");
  if (market.status === "suspended") throw Errors.forbidden("This market is suspended");

  return { market, role: membership.role as Role };
}
