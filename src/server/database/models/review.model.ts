import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * A product review.
 *
 * One per shopper per product — the `{product, user}` unique index enforces it,
 * so re-reviewing edits the existing row rather than stacking duplicates. Both
 * fields are always present, so a plain unique index is correct here (unlike the
 * wishlist, whose owner is one-of-two nullable fields and needs a partial index).
 *
 * `vendor` is denormalized from the product so a store can moderate its own
 * reviews without a join, and `order` records the purchase that verified it —
 * the service only accepts a review from someone who actually bought the item.
 */
const reviewSchema = new Schema({
  product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
  vendor: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  /** The purchase this review is vouched by. */
  order: { type: Schema.Types.ObjectId, ref: "Order", default: null },

  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, default: null, trim: true },
  body: { type: String, default: null, trim: true },

  /**
   * Reviews publish immediately; the field exists so a later moderation flow can
   * hide one without deleting it, and so the rating aggregation can exclude
   * hidden ones. Only `published` reviews count toward a product's rating.
   */
  status: { type: String, enum: ["published", "hidden"], default: "published", index: true },
});

reviewSchema.plugin(basePlugin);
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
// The product page reads a page of a product's reviews, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });

export type ReviewRaw = InferSchemaType<typeof reviewSchema> & BaseFields;
export type ReviewDoc = HydratedDocument<ReviewRaw>;

export const Review: Model<ReviewRaw> =
  (models.Review as Model<ReviewRaw>) ?? model<ReviewRaw>("Review", reviewSchema);
