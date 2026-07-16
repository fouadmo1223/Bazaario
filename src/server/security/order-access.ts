import { cookies } from "next/headers";
import { getServerEnv } from "@/shared/config/env";

/**
 * Who may view an order.
 *
 * Signed-in shoppers are checked against `order.customer`. Guests have no
 * account to check, so placing an order grants an explicit capability: the
 * order's id is recorded in an httpOnly cookie, and only ids in that cookie can
 * be viewed.
 *
 * The alternative — trusting whoever knows the URL — is unsafe here because
 * order numbers are sequential (`1000 + seq`), so `/order/1002` would walk
 * straight into the next shopper's order. Ids are ObjectIds and the grant is
 * required regardless, so neither guessing nor incrementing is enough.
 */

const ORDER_COOKIE = "order_access";
const ORDER_TTL_SECONDS = 30 * 86400;

/** Cap the cookie so a long guest session can't grow an unbounded header. */
const MAX_GRANTS = 10;

async function readGrants(): Promise<string[]> {
  const raw = (await cookies()).get(ORDER_COOKIE)?.value;
  if (!raw) return [];
  return raw.split(",").filter((id) => /^[0-9a-f]{24}$/i.test(id));
}

/** Record that this visitor placed `orderId` and may view it. Actions only. */
export async function grantOrderAccess(orderId: string): Promise<void> {
  const existing = await readGrants();
  if (existing.includes(orderId)) return;

  const next = [orderId, ...existing].slice(0, MAX_GRANTS);
  (await cookies()).set(ORDER_COOKIE, next.join(","), {
    httpOnly: true,
    secure: getServerEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ORDER_TTL_SECONDS,
  });
}

/** True when the current request holds a guest grant for this order. */
export async function hasOrderGrant(orderId: string): Promise<boolean> {
  return (await readGrants()).includes(orderId);
}

/**
 * Decide whether the current visitor may read an order. Owning user wins;
 * otherwise a guest grant is required. Vendor staff read orders through the
 * dashboard, which has its own vendor-scoped permission check.
 */
export async function canViewOrder(
  order: { customer?: unknown; _id: unknown },
  userId?: string,
): Promise<boolean> {
  const orderId = String(order._id);
  if (userId && order.customer && String(order.customer) === userId) return true;
  return hasOrderGrant(orderId);
}
