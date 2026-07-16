import { connectToDatabase } from "@/server/database/connection";
import { Wishlist, type WishlistDoc } from "@/server/database/models/wishlist.model";
import { Product } from "@/server/database/models/product.model";
import { Errors } from "@/shared/lib/errors";

type WishlistOwner = { userId?: string; guestToken?: string };

function ownerFilter(owner: WishlistOwner) {
  if (owner.userId) return { user: owner.userId };
  if (owner.guestToken) return { guestToken: owner.guestToken };
  throw Errors.badRequest("Wishlist owner required");
}

/**
 * Saved items for a shopper. Marketplace-wide (not vendor-scoped) and free of
 * price snapshots — prices are read live from the product when the list renders.
 */
export const wishlistService = {
  async getOrCreate(owner: WishlistOwner): Promise<WishlistDoc> {
    await connectToDatabase();
    const filter = ownerFilter(owner);
    let list = await Wishlist.findOne(filter);
    if (!list) {
      list = await Wishlist.create({
        ...filter,
        items: [],
        expiresAt: owner.guestToken ? new Date(Date.now() + 90 * 86400_000) : null,
      });
    }
    return list;
  },

  /** Adding an item already saved is a no-op, not an error. */
  async add(owner: WishlistOwner, productId: string): Promise<WishlistDoc> {
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, status: "active" });
    if (!product) throw Errors.notFound("Product not available");

    const list = await this.getOrCreate(owner);
    if (list.items.some((i) => String(i.product) === productId)) return list;

    list.items.push({
      product: product._id,
      vendor: product.vendor,
      addedAt: new Date(),
    });
    await list.save();
    return list;
  },

  async remove(owner: WishlistOwner, productId: string): Promise<WishlistDoc> {
    await connectToDatabase();
    const list = await this.getOrCreate(owner);
    list.items = list.items.filter((i) => String(i.product) !== productId) as typeof list.items;
    await list.save();
    return list;
  },

  /** Flip membership. Returns the resulting state so the UI can reflect it. */
  async toggle(owner: WishlistOwner, productId: string): Promise<{ list: WishlistDoc; saved: boolean }> {
    const current = await this.getOrCreate(owner);
    const has = current.items.some((i) => String(i.product) === productId);
    const list = has ? await this.remove(owner, productId) : await this.add(owner, productId);
    return { list, saved: !has };
  },

  async clear(owner: WishlistOwner): Promise<void> {
    await connectToDatabase();
    await Wishlist.findOneAndUpdate(ownerFilter(owner), { $set: { items: [] } });
  },

  async has(owner: WishlistOwner, productId: string): Promise<boolean> {
    await connectToDatabase();
    const list = await Wishlist.findOne(ownerFilter(owner));
    return Boolean(list?.items.some((i) => String(i.product) === productId));
  },

  /** Product ids saved by this owner — used to mark hearts across a listing. */
  async savedProductIds(owner: WishlistOwner): Promise<Set<string>> {
    await connectToDatabase();
    if (!owner.userId && !owner.guestToken) return new Set();
    const list = await Wishlist.findOne(ownerFilter(owner));
    return new Set(list?.items.map((i) => String(i.product)) ?? []);
  },

  /**
   * Fold a guest list into the user's on login. Union, not replace: the shopper
   * keeps what they saved both before and after signing in.
   */
  async mergeGuestIntoUser(guestToken: string, userId: string): Promise<WishlistDoc> {
    await connectToDatabase();
    const guest = await Wishlist.findOne({ guestToken });
    const user = await this.getOrCreate({ userId });
    if (!guest || guest.items.length === 0) return user;

    const known = new Set(user.items.map((i) => String(i.product)));
    for (const item of guest.items) {
      if (!known.has(String(item.product))) user.items.push(item);
    }
    await user.save();
    await Wishlist.deleteOne({ _id: guest._id }).setOptions({ withDeleted: true });
    return user;
  },
};
