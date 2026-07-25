import { Types } from "mongoose";
import { connectToDatabase } from "@/server/database/connection";
import { Review, type ReviewDoc } from "@/server/database/models/review.model";
import { Product } from "@/server/database/models/product.model";
import { Order } from "@/server/database/models/order.model";
import { Errors } from "@/shared/lib/errors";
import { paginationSchema, buildPaginated, type Paginated } from "@/shared/lib/pagination";
import { writeAudit } from "./audit.service";

export type Actor = { id: string };

/**
 * Order statuses that count as "bought it". A review is a verified-purchase
 * signal, so it is gated on the buyer having an order for the product that
 * actually went through — pending (never paid) and cancelled orders do not
 * qualify, and neither does simply having it in a cart.
 */
const PURCHASED_STATUSES = ["paid", "processing", "shipped", "out_for_delivery", "delivered"] as const;

type SubmitInput = {
  productId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
};

export const reviewService = {
  /**
   * Add or update the caller's review of a product.
   *
   * Refused unless the caller has a qualifying order containing the product —
   * the gate is the whole point of a review carrying weight. One review per
   * shopper per product, so a second submission edits the first (upsert against
   * the unique index) rather than stacking. The product's denormalized rating is
   * then recomputed from the real reviews, replacing whatever seed value it held.
   */
  async submit(actor: Actor, input: SubmitInput): Promise<ReviewDoc> {
    await connectToDatabase();

    if (!Types.ObjectId.isValid(input.productId)) throw Errors.notFound("Product not found");
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      throw Errors.validation("Rating must be a whole number from 1 to 5");
    }

    const product = await Product.findById(input.productId).select("_id vendor");
    if (!product) throw Errors.notFound("Product not found");

    // Verified purchase: an order of theirs that reached a paid-or-later status
    // and contains this product.
    const order = await Order.findOne({
      customer: actor.id,
      status: { $in: PURCHASED_STATUSES },
      "items.product": product._id,
    }).select("_id");
    if (!order) {
      throw Errors.forbidden("You can review a product only after buying it");
    }

    const review = await Review.findOneAndUpdate(
      { product: product._id, user: actor.id },
      {
        $set: {
          rating: input.rating,
          title: input.title?.trim() || null,
          body: input.body?.trim() || null,
          vendor: product.vendor,
          order: order._id,
          status: "published",
        },
        $setOnInsert: { createdBy: actor.id },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    await this.recomputeProductRating(String(product._id));

    await writeAudit({
      actor: actor.id, vendor: String(product.vendor), action: "review.submit",
      entity: "Product", entityId: String(product._id), diff: { rating: input.rating },
    });

    return review;
  },

  /**
   * Recompute a product's denormalized `ratingAvg`/`ratingCount` from its
   * published reviews. The average is rounded to one decimal — the precision the
   * storefront shows — so the stored value and the displayed value never disagree.
   */
  async recomputeProductRating(productId: string): Promise<{ avg: number; count: number }> {
    await connectToDatabase();
    const [agg] = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { product: new Types.ObjectId(productId), status: "published", deletedAt: null } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    const count = agg?.count ?? 0;
    const avg = count ? Math.round(agg!.avg * 10) / 10 : 0;
    await Product.updateOne({ _id: productId }, { $set: { ratingAvg: avg, ratingCount: count } });
    return { avg, count };
  },

  /** A page of a product's published reviews, newest first. */
  async listForProduct(productId: string, query: unknown): Promise<Paginated<ReviewDoc>> {
    await connectToDatabase();
    if (!Types.ObjectId.isValid(productId)) return buildPaginated([], 0, { page: 1, limit: 10 });

    const pagination = paginationSchema.parse(query);
    const skip = (pagination.page - 1) * pagination.limit;
    const filter: Record<string, unknown> = { product: productId, status: "published" };

    const [items, total] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.limit)
        .populate("user", "name")
        .exec(),
      Review.countDocuments(filter).exec(),
    ]);
    return buildPaginated(items, total, pagination);
  },

  /** The caller's own review of a product, if any — so the form can prefill. */
  async getOwn(actor: Actor, productId: string): Promise<ReviewDoc | null> {
    await connectToDatabase();
    if (!Types.ObjectId.isValid(productId)) return null;
    return Review.findOne({ product: productId, user: actor.id });
  },
};
