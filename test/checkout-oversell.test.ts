import { describe, it, expect } from "vitest";
import { checkoutService } from "@/server/services/checkout.service";
import { Product } from "@/server/database/models/product.model";
import { Order } from "@/server/database/models/order.model";
import { makeUser, makeVendor, makeProduct, makeCart, testAddress } from "./factories";

/**
 * The money invariant: stock must never go negative, and the last unit must go
 * to exactly one buyer.
 *
 * `checkout.service` claims stock with a conditional update —
 * `{_id, stock: {$gte: qty}}` — so the read and the write are one atomic
 * operation. This suite is the reason that has to stay true: it is the kind of
 * property that silently regresses the moment someone "simplifies" the
 * decrement into a read-then-write, and no amount of manual clicking would
 * catch it.
 *
 * ARCHITECTURE.md §6.2 documents the design.
 */

async function placeOrderFor(vendorId: string, userId: string) {
  return checkoutService.createOrder(
    vendorId,
    { userId },
    { paymentProvider: "cod", address: testAddress },
  );
}

describe("inventory reservation", () => {
  it("decrements stock by the quantity ordered", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 10 });
    await makeCart(vendor._id, user._id, product, 3);

    await placeOrderFor(String(vendor._id), String(user._id));

    const fresh = await Product.findById(product._id);
    expect(fresh!.stock).toBe(7);
  });

  it("refuses an order for more than there is", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 2 });
    await makeCart(vendor._id, user._id, product, 5);

    await expect(placeOrderFor(String(vendor._id), String(user._id))).rejects.toThrow();

    const fresh = await Product.findById(product._id);
    expect(fresh!.stock).toBe(2); // untouched
    expect(await Order.countDocuments({})).toBe(0);
  });

  /**
   * The one that matters. Ten buyers race for a single unit; exactly one may
   * win, stock must land at zero, and it must never go negative.
   *
   * A read-then-write implementation passes every other test in this file and
   * fails this one.
   */
  it("gives the last unit to exactly one of ten simultaneous buyers", async () => {
    const vendor = await makeVendor();
    const product = await makeProduct(vendor._id, { stock: 1 });

    const buyers = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    await Promise.all(buyers.map((b) => makeCart(vendor._id, b._id, product, 1)));

    const results = await Promise.allSettled(
      buyers.map((b) => placeOrderFor(String(vendor._id), String(b._id))),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);

    const fresh = await Product.findById(product._id);
    expect(fresh!.stock).toBe(0);
    expect(fresh!.stock).toBeGreaterThanOrEqual(0);

    expect(await Order.countDocuments({})).toBe(1);
  });

  /**
   * Backorder-enabled products are deliberately *not* guarded — they are meant
   * to go negative. Asserting it keeps someone from "fixing" the guard to cover
   * every product and quietly breaking pre-orders.
   */
  it("lets a backorder product go negative on purpose", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 1, allowBackorder: true });
    await makeCart(vendor._id, user._id, product, 5);

    await placeOrderFor(String(vendor._id), String(user._id));

    const fresh = await Product.findById(product._id);
    expect(fresh!.stock).toBe(-4);
  });

  it("ignores stock entirely when the product does not track inventory", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 0, trackInventory: false });
    await makeCart(vendor._id, user._id, product, 3);

    await expect(placeOrderFor(String(vendor._id), String(user._id))).resolves.toBeTruthy();
  });

  it("refuses to sell a product that is not active", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 10, status: "draft" });
    await makeCart(vendor._id, user._id, product, 1);

    await expect(placeOrderFor(String(vendor._id), String(user._id))).rejects.toThrow();

    const fresh = await Product.findById(product._id);
    expect(fresh!.stock).toBe(10);
  });

  /** A suspended vendor must not be able to take money. */
  it("refuses checkout against an inactive vendor", async () => {
    const vendor = await makeVendor({ status: "suspended" });
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 10 });
    await makeCart(vendor._id, user._id, product, 1);

    await expect(placeOrderFor(String(vendor._id), String(user._id))).rejects.toThrow();
  });

  it("refuses an empty cart", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();

    await expect(placeOrderFor(String(vendor._id), String(user._id))).rejects.toThrow();
  });
});
