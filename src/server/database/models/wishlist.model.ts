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

// One list per owner. Partial indexes, not `sparse`: a sparse unique index still
// indexes an explicit `guestToken: null` (sparse skips only *absent* fields), and
// the schema default writes that null on every user-owned list — so the second
// such list collides with `guestToken: null` already taken. Filtering on type
// indexes a document only once its owning field holds a real value, so the null
// side of each pair never enters the unique index.
wishlistSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { user: { $type: "objectId" } } });
wishlistSchema.index(
  { guestToken: 1 },
  { unique: true, partialFilterExpression: { guestToken: { $type: "string" } } },
);

wishlistSchema.virtual("itemCount").get(function (this: { items: unknown[] }) {
  return this.items.length;
});

export type WishlistRaw = InferSchemaType<typeof wishlistSchema> & BaseFields;
export type WishlistDoc = HydratedDocument<WishlistRaw>;

export const Wishlist: Model<WishlistRaw> =
  (models.Wishlist as Model<WishlistRaw>) ?? model<WishlistRaw>("Wishlist", wishlistSchema);
