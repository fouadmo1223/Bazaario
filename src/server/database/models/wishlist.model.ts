import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * A saved-items list. Owned by a `user` (signed in) or a `guestToken`
 * (anonymous), mirroring Cart so the same guest cookie carries both and both
 * merge on login.
 *
 * Unlike Cart this holds no price snapshot: a wishlist is a pointer to a
 * product, and its price should read live whenever the list is viewed —
 * snapshotting would show a stale price weeks later.
 *
 * Not vendor-scoped. A shopper's saved items span the marketplace, so scoping
 * per vendor would fragment one list into many.
 */
const wishlistItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    // Denormalized so the list can be filtered/linked without loading products.
    vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const wishlistSchema = new Schema({
  // No `index: true` on these two — the unique indexes declared below already
  // cover them, and declaring both makes Mongoose build each index twice.
  user: { type: Schema.Types.ObjectId, ref: "User", default: null },
  guestToken: { type: String, default: null },
  items: { type: [wishlistItemSchema], default: [] },
  expiresAt: { type: Date, default: null }, // guest lists age out
});

wishlistSchema.plugin(basePlugin);

// One list per owner. `sparse` keeps the null side of each pair out of the index,
// so many user-owned lists (guestToken: null) don't collide with each other.
wishlistSchema.index({ user: 1 }, { unique: true, sparse: true });
wishlistSchema.index({ guestToken: 1 }, { unique: true, sparse: true });

wishlistSchema.virtual("itemCount").get(function (this: { items: unknown[] }) {
  return this.items.length;
});

export type WishlistRaw = InferSchemaType<typeof wishlistSchema> & BaseFields;
export type WishlistDoc = HydratedDocument<WishlistRaw>;

export const Wishlist: Model<WishlistRaw> =
  (models.Wishlist as Model<WishlistRaw>) ?? model<WishlistRaw>("Wishlist", wishlistSchema);
