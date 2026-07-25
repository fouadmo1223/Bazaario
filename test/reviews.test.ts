import { describe, it, expect } from "vitest";
import { reviewService } from "@/server/services/review.service";
import { checkoutService } from "@/server/services/checkout.service";
import { Product } from "@/server/database/models/product.model";
import { Order } from "@/server/database/models/order.model";
import { Review } from "@/server/database/models/review.model";
import { makeUser, makeVendor, makeProduct, makeCart, testAddress } from "./factories";
import type { UserDoc } from "@/server/database/models/user.model";
import type { ProductDoc } from "@/server/database/models/product.model";
import type { OrderStatus } from "@/server/database/models/order.model";

/**
 * Product reviews.
 *
 * Two invariants carry the feature. A review is a verified-purchase signal, so
 * the service must refuse one from someone who has not bought the product — that
 * gate is the whole reason a rating means anything. And a product's displayed
 * rating is denormalized, so it must track the real reviews rather than drift
 * from them; the first real review has to replace whatever the seed put there.
 */

/** Buy `product` as `user`, then advance the order to a bought-and-kept status. */
async function purchase(
  vendorId: string,
  user: UserDoc,
  product: ProductDoc,
  status: OrderStatus = "delivered",
) {
  await makeCart(vendorId, user._id, product, 1);
  const order = await checkoutService.createOrder(
    vendorId,
    { userId: String(user._id) },
    { paymentProvider: "cod", address: testAddress },
  );
  await Order.updateOne({ _id: order._id }, { $set: { status } });
  return order;
}

describe("review verified-purchase gate", () => {
  it("accepts a review from someone who bought the product", async () => {
    const vendor = await makeVendor();
    const buyer = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5 });
    await purchase(String(vendor._id), buyer, product);

    const review = await reviewService.submit(
      { id: String(buyer._id) },
      { productId: String(product._id), rating: 4, body: "Solid." },
    );

    expect(review.rating).toBe(4);
    expect(String(review.vendor)).toBe(String(vendor._id));
  });

  it("refuses a review from someone who never bought it", async () => {
    const vendor = await makeVendor();
    const stranger = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5 });

    await expect(
      reviewService.submit({ id: String(stranger._id) }, { productId: String(product._id), rating: 5 }),
    ).rejects.toThrow();

    expect(await Review.countDocuments({ product: product._id })).toBe(0);
  });

  it("does not count a still-pending order as a purchase", async () => {
    const vendor = await makeVendor();
    const buyer = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5 });
    // Order left in its default "pending" status — created but never paid.
    await purchase(String(vendor._id), buyer, product, "pending");

    await expect(
      reviewService.submit({ id: String(buyer._id) }, { productId: String(product._id), rating: 5 }),
    ).rejects.toThrow();
  });

  it("rejects a rating outside 1–5", async () => {
    const vendor = await makeVendor();
    const buyer = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5 });
    await purchase(String(vendor._id), buyer, product);

    for (const rating of [0, 6, 3.5]) {
      await expect(
        reviewService.submit({ id: String(buyer._id) }, { productId: String(product._id), rating }),
      ).rejects.toThrow();
    }
  });
});

describe("review rating recomputation", () => {
  it("replaces the seed rating with the real one and counts once per shopper", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct(vendor._id, { stock: 20 });
    // Pretend the seed left a decorative rating behind.
    await Product.updateOne({ _id: product._id }, { $set: { ratingAvg: 4.9, ratingCount: 91 } });

    const a = await makeUser();
    const b = await makeUser();
    await purchase(String(vendor._id), a, product);
    await purchase(String(vendor._id), b, product);

    await reviewService.submit({ id: String(a._id) }, { productId: String(product._id), rating: 5 });
    await reviewService.submit({ id: String(b._id) }, { productId: String(product._id), rating: 4 });

    const fresh = await Product.findById(product._id);
    expect(fresh!.ratingCount).toBe(2);
    expect(fresh!.ratingAvg).toBe(4.5);
  });

  it("edits an existing review rather than stacking a second one", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct(vendor._id, { stock: 20 });
    const buyer = await makeUser();
    await purchase(String(vendor._id), buyer, product);

    await reviewService.submit({ id: String(buyer._id) }, { productId: String(product._id), rating: 2 });
    await reviewService.submit({ id: String(buyer._id) }, { productId: String(product._id), rating: 5, body: "Changed my mind." });

    expect(await Review.countDocuments({ product: product._id, user: buyer._id })).toBe(1);
    const fresh = await Product.findById(product._id);
    expect(fresh!.ratingCount).toBe(1);
    expect(fresh!.ratingAvg).toBe(5);
  });

  it("rounds the average to one decimal so stored and shown agree", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct(vendor._id, { stock: 20 });
    const [a, b, c] = [await makeUser(), await makeUser(), await makeUser()];
    for (const u of [a, b, c]) await purchase(String(vendor._id), u, product);

    // 5, 4, 4 → 4.333… → 4.3
    await reviewService.submit({ id: String(a._id) }, { productId: String(product._id), rating: 5 });
    await reviewService.submit({ id: String(b._id) }, { productId: String(product._id), rating: 4 });
    await reviewService.submit({ id: String(c._id) }, { productId: String(product._id), rating: 4 });

    const fresh = await Product.findById(product._id);
    expect(fresh!.ratingAvg).toBe(4.3);
  });
});
