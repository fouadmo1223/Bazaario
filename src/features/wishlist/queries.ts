import { Wishlist } from "@/server/database/models/wishlist.model";
import { Product } from "@/server/database/models/product.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { connectToDatabase } from "@/server/database/connection";
import { getCurrentUser } from "@/server/security/current-user";
import { readGuestToken } from "@/server/security/guest-token";

/**
 * Read model for the wishlist page.
 *
 * Prices are read live from the product rather than snapshotted at save time —
 * a list looked at weeks later should show what the item costs now.
 */
export type WishlistItemView = {
  productId: string;
  slug: string;
  title: string;
  image: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  stock: number;
  /** False once a product is archived or deleted out from under the list. */
  available: boolean;
  vendorId: string;
  vendorName: string;
  vendorSlug: string;
  addedAt: string;
};

/**
 * Load the visitor's saved items.
 *
 * Read-only: never mints a guest token, because Server Components cannot set
 * cookies. A visitor with no list simply sees an empty one.
 */
export async function getWishlistView(): Promise<WishlistItemView[]> {
  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();
  if (!user && !guestToken) return [];

  await connectToDatabase();
  const list = await Wishlist.findOne(user ? { user: user.id } : { guestToken });
  if (!list || list.items.length === 0) return [];

  const productIds = list.items.map((i) => i.product);
  const [products, vendors] = await Promise.all([
    Product.find({ _id: { $in: productIds } }),
    Vendor.find({ _id: { $in: list.items.map((i) => i.vendor) } }).select("name slug status"),
  ]);

  const productById = new Map(products.map((p) => [String(p._id), p]));
  const vendorById = new Map(vendors.map((v) => [String(v._id), v]));

  const views: WishlistItemView[] = [];
  for (const item of list.items) {
    const product = productById.get(String(item.product));
    const vendor = vendorById.get(String(item.vendor));

    // A saved product can be archived, deleted, or belong to a vendor that has
    // since been suspended. Keep the row but mark it unavailable rather than
    // dropping it silently — the shopper saved it and should see what happened.
    if (!product || !vendor) {
      continue;
    }

    views.push({
      productId: String(product._id),
      slug: product.slug,
      title: product.title,
      image: product.media[0]?.url ?? null,
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      currency: vendor.get("settings")?.currency ?? "USD",
      stock: product.stock,
      available: product.status === "active" && vendor.status === "active",
      vendorId: String(vendor._id),
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      addedAt: item.addedAt.toISOString(),
    });
  }

  // Newest first — the list is a shopping aid, not an archive.
  return views.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}
