import { cartService } from "@/server/services/cart.service";
import { wishlistService } from "@/server/services/wishlist.service";
import { readGuestToken, clearGuestToken } from "@/server/security/guest-token";
import { logger } from "@/shared/lib/logger";

/**
 * Carry anything the visitor collected while signed out into their account —
 * both carts and the wishlist, which share the one guest-token cookie.
 *
 * This lives outside `actions.ts` on purpose. That file is `"use server"`, where
 * every export becomes a callable endpoint — publishing a function that takes a
 * `userId` would let anyone POST someone else's id and merge a cart into their
 * account. Callers here have already authenticated the id themselves.
 *
 * Deliberately non-fatal: the visitor has authenticated by this point, so a
 * merge failure must not turn a successful sign-in into an error. Worst case the
 * guest data is left behind and the cookie survives to be retried next time.
 */
export async function absorbGuestData(userId: string): Promise<void> {
  const guestToken = await readGuestToken();
  if (!guestToken) return;

  try {
    const vendors = await cartService.mergeAllGuestCarts(guestToken, userId);
    const wishlist = await wishlistService.mergeGuestIntoUser(guestToken, userId);

    // Only drop the token once both merges have succeeded — clearing it early
    // would strand whatever was left behind with no way to find it again.
    await clearGuestToken();
    logger.info(
      { userId, vendors: vendors.length, wishlistItems: wishlist.items.length },
      "Guest cart and wishlist merged",
    );
  } catch (err) {
    logger.warn({ err, userId }, "Guest merge failed; sign-in unaffected");
  }
}
