import { cartService } from "@/server/services/cart.service";
import { readGuestToken, clearGuestToken } from "@/server/security/guest-token";
import { logger } from "@/shared/lib/logger";

/**
 * Carry anything the visitor put in a cart while signed out into their account.
 *
 * This lives outside `actions.ts` on purpose. That file is `"use server"`, where
 * every export becomes a callable endpoint — publishing a function that takes a
 * `userId` would let anyone POST someone else's id and merge a cart into their
 * account. Callers here have already authenticated the id themselves.
 *
 * Deliberately non-fatal: the visitor has authenticated by this point, so a
 * merge failure must not turn a successful sign-in into an error. Worst case the
 * guest cart is left behind and the cookie survives to be retried next time.
 */
export async function absorbGuestCart(userId: string): Promise<void> {
  const guestToken = await readGuestToken();
  if (!guestToken) return;

  try {
    const vendors = await cartService.mergeAllGuestCarts(guestToken, userId);
    await clearGuestToken();
    if (vendors.length) logger.info({ userId, vendors: vendors.length }, "Guest carts merged");
  } catch (err) {
    logger.warn({ err, userId }, "Guest cart merge failed; sign-in unaffected");
  }
}
