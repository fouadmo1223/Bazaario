import { connectToDatabase } from "@/server/database/connection";
import { Cart, type CartDoc } from "@/server/database/models/cart.model";
import { Product } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { Errors } from "@/shared/lib/errors";

type CartOwner = { userId?: string; guestToken?: string };

function ownerFilter(marketId: string, owner: CartOwner) {
  if (owner.userId) return { market: marketId, user: owner.userId };
  if (owner.guestToken) return { market: marketId, guestToken: owner.guestToken };
  throw Errors.badRequest("Cart owner required");
}

/**
 * Cart service. Supports both logged-in and guest carts, price snapshotting,
 * and merging a guest cart into the user cart at login. Stock is validated on
 * add and re-validated at checkout (never trust the client's price).
 */
export const cartService = {
  async getOrCreate(marketId: string, owner: CartOwner): Promise<CartDoc> {
    await connectToDatabase();
    const filter = ownerFilter(marketId, owner);
    let cart = await Cart.findOne(filter);
    if (!cart) {
      cart = await Cart.create({
        ...filter,
        items: [],
        // Guest carts expire after 30 days of inactivity.
        expiresAt: owner.guestToken ? new Date(Date.now() + 30 * 86400_000) : null,
      });
    }
    return cart;
  },

  async addItem(
    marketId: string,
    owner: CartOwner,
    input: { productId: string; variantId?: string; quantity: number },
  ): Promise<CartDoc> {
    await connectToDatabase();
    if (input.quantity < 1) throw Errors.badRequest("Quantity must be at least 1");

    const product = await Product.findOne({ _id: input.productId, market: marketId, status: "active" });
    if (!product) throw Errors.notFound("Product not available");

    let unitPrice = product.price;
    let sku = product.sku;
    let image = product.media[0]?.url ?? null;
    let stock = product.stock;

    if (product.type === "variable") {
      if (!input.variantId) throw Errors.badRequest("Please select a variant");
      const variant = await Variant.findOne({ _id: input.variantId, product: product._id, isActive: true });
      if (!variant) throw Errors.notFound("Variant not available");
      unitPrice = variant.price;
      sku = variant.sku;
      image = variant.image ?? image;
      stock = variant.stock;
    }

    const cart = await this.getOrCreate(marketId, owner);
    const existing = cart.items.find(
      (i) =>
        String(i.product) === input.productId &&
        String(i.variant ?? "") === String(input.variantId ?? ""),
    );
    const desiredQty = (existing?.quantity ?? 0) + input.quantity;

    if (product.trackInventory && !product.allowBackorder && desiredQty > stock) {
      throw Errors.conflict(`Only ${stock} in stock`);
    }

    if (existing) {
      existing.quantity = desiredQty;
      existing.unitPrice = unitPrice; // refresh snapshot
    } else {
      cart.items.push({
        product: product._id,
        variant: input.variantId ? (input.variantId as unknown as CartDoc["items"][number]["variant"]) : null,
        title: product.title,
        image,
        sku,
        unitPrice,
        quantity: input.quantity,
      });
    }
    cart.currency = product.get("currency") ?? cart.currency;
    await cart.save();
    return cart;
  },

  async updateItem(
    marketId: string,
    owner: CartOwner,
    input: { productId: string; variantId?: string; quantity: number },
  ): Promise<CartDoc> {
    await connectToDatabase();
    const cart = await this.getOrCreate(marketId, owner);
    const item = cart.items.find(
      (i) => String(i.product) === input.productId && String(i.variant ?? "") === String(input.variantId ?? ""),
    );
    if (!item) throw Errors.notFound("Item not in cart");

    if (input.quantity <= 0) {
      cart.items = cart.items.filter((i) => i !== item) as typeof cart.items;
    } else {
      item.quantity = input.quantity;
    }
    await cart.save();
    return cart;
  },

  async removeItem(marketId: string, owner: CartOwner, productId: string, variantId?: string): Promise<CartDoc> {
    return this.updateItem(marketId, owner, { productId, variantId, quantity: 0 });
  },

  async clear(marketId: string, owner: CartOwner): Promise<void> {
    await connectToDatabase();
    await Cart.findOneAndUpdate(ownerFilter(marketId, owner), { $set: { items: [], coupon: null } });
  },

  /** Merge a guest cart into the user's cart on login, summing quantities. */
  async mergeGuestIntoUser(marketId: string, guestToken: string, userId: string): Promise<CartDoc> {
    await connectToDatabase();
    const guest = await Cart.findOne({ market: marketId, guestToken });
    const user = await this.getOrCreate(marketId, { userId });
    if (!guest || guest.items.length === 0) return user;

    for (const gi of guest.items) {
      const match = user.items.find(
        (ui) => String(ui.product) === String(gi.product) && String(ui.variant ?? "") === String(gi.variant ?? ""),
      );
      if (match) match.quantity += gi.quantity;
      else user.items.push(gi);
    }
    if (!user.coupon && guest.coupon) user.coupon = guest.coupon;
    await user.save();
    await Cart.deleteOne({ _id: guest._id }).setOptions({ withDeleted: true });
    return user;
  },
};
