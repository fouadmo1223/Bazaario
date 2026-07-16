import { Cart } from "@/server/database/models/cart.model";
import { Wishlist } from "@/server/database/models/wishlist.model";
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
 */
export const GET = route(async () => {
  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();

  // Nothing identifies this visitor yet, so there is nothing to count.
  if (!user && !guestToken) return json({ cart: 0, wishlist: 0, wishlistIds: [] });

  await connectToDatabase();
  const owner = user ? { user: user.id } : { guestToken };

  const [carts, wishlist] = await Promise.all([
    Cart.find(owner).select("items.quantity"),
    Wishlist.findOne(owner).select("items"),
  ]);

  const cart = carts.reduce(
    (sum, c) => sum + c.items.reduce((n, i) => n + i.quantity, 0),
    0,
  );
  const wishlistIds = wishlist?.items.map((i) => String(i.product)) ?? [];

  return json({ cart, wishlist: wishlistIds.length, wishlistIds });
});
