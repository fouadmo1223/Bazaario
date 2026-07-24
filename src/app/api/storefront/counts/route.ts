import { Cart } from "@/server/database/models/cart.model";
import { Wishlist } from "@/server/database/models/wishlist.model";
import { Notification } from "@/server/database/models/notification.model";
import { connectToDatabase } from "@/server/database/connection";
import { getCurrentUser } from "@/server/security/current-user";
import { readGuestToken } from "@/server/security/guest-token";
import { json, route } from "@/shared/lib/api-response";

/**
 * Everything per-visitor the storefront chrome needs, in one request: cart and
 * wishlist counts plus the saved product ids.
 *
 * This exists so the storefront pages can stay ISR-cached and shared between
 * visitors. Reading these cookies during a page's render would force it dynamic
 * and rebuild the whole catalogue per visitor, to show a badge and some hearts.
 *
 * `wishlistIds` ships with the counts rather than as a second endpoint — the
 * header and every product card need the same snapshot, so one fetch serves all.
 *
 * The cart total spans vendors: carts are per-vendor, the badge is one number.
 *
 * `notifications` is the unread count only — a number for the bell's badge. The
 * notifications themselves are fetched lazily when the bell is opened, so the
 * chrome does not carry every title and body on every navigation. Guests have
 * none: notifications belong to an account.
 */
export const GET = route(async () => {
  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();

  // Nothing identifies this visitor yet, so there is nothing to count.
  if (!user && !guestToken) {
    return json({ cart: 0, wishlist: 0, wishlistIds: [], notifications: 0, signedIn: false });
  }

  await connectToDatabase();
  const owner = user ? { user: user.id } : { guestToken };

  const [carts, wishlist, notifications] = await Promise.all([
    Cart.find(owner).select("items.quantity"),
    Wishlist.findOne(owner).select("items"),
    user ? Notification.countDocuments({ user: user.id, readAt: null }) : Promise.resolve(0),
  ]);

  const cart = carts.reduce(
    (sum, c) => sum + c.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );
  const wishlistIds = wishlist?.items.map((i) => String(i.product)) ?? [];

  // `signedIn` distinguishes a guest from an account with nothing unread — both
  // report 0, but only one should be shown a notification bell at all.
  return json({
    cart,
    wishlist: wishlistIds.length,
    wishlistIds,
    notifications,
    signedIn: Boolean(user),
  });
});
