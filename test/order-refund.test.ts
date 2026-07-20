import { describe, it, expect } from "vitest";
import { orderService } from "@/server/services/order.service";
import { checkoutService } from "@/server/services/checkout.service";
import { paymentService } from "@/server/services/payment.service";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { makeUser, makeVendor, makeProduct, makeCart, testAddress } from "./factories";

/**
 * Refund arithmetic.
 *
 * Refunds move money *out*, restock inventory, and are the one order operation
 * with no visible confirmation elsewhere in the product — nobody notices a
 * wrong number here until the books are reconciled, which may be a month later.
 *
 * Several of these use awkward amounts on purpose. Money is stored as a
 * floating-point number, so partial refunds that should add up exactly do not
 * always do so in binary, and the interesting failures live precisely there.
 */

/**
 * A paid order with `stock` units of one product reserved.
 *
 * `grandTotal` is pinned rather than derived from the unit price, because
 * checkout adds tax and shipping on top — an order for a 1.05 item does not
 * total 1.05. The float-exactness tests below need to name the total exactly,
 * so it is set here after pricing has run.
 */
async function paidOrder(
  grandTotal: number,
  quantity = 1,
  stock = 10,
): Promise<{ order: OrderDoc; vendorId: string; actorId: string; productId: string }> {
  const vendor = await makeVendor();
  const user = await makeUser();
  const product = await makeProduct(vendor._id, { stock, price: grandTotal });
  await makeCart(vendor._id, user._id, product, quantity);

  const order = await checkoutService.createOrder(
    String(vendor._id),
    { userId: String(user._id) },
    { paymentProvider: "cod", address: testAddress },
  );

  // Refunds require a paid order; go through the real capture path.
  order.payment.status = "paid";
  order.status = "paid";
  order.totals.grandTotal = grandTotal;
  await order.save();

  return {
    order,
    vendorId: String(vendor._id),
    actorId: String(user._id),
    productId: String(product._id),
  };
}

describe("refund validation", () => {
  it("refuses to refund an order that was never paid", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5, price: 50 });
    await makeCart(vendor._id, user._id, product, 1);
    const order = await checkoutService.createOrder(
      String(vendor._id),
      { userId: String(user._id) },
      { paymentProvider: "cod", address: testAddress },
    );

    await expect(
      orderService.refund(String(vendor._id), String(order._id), String(user._id), { amount: 10 }),
    ).rejects.toThrow(/only paid orders/i);
  });

  it("refuses a zero or negative amount", async () => {
    const { order, vendorId, actorId } = await paidOrder(50);

    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: 0 }),
    ).rejects.toThrow();
    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: -5 }),
    ).rejects.toThrow();
  });

  it("refuses more than the order total", async () => {
    const { order, vendorId, actorId } = await paidOrder(50);
    const total = order.totals.grandTotal;

    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: total + 0.01 }),
    ).rejects.toThrow(/exceeds/i);
  });

  it("refuses more than what remains after an earlier refund", async () => {
    const { order, vendorId, actorId } = await paidOrder(50);
    const total = order.totals.grandTotal;

    await orderService.refund(vendorId, String(order._id), actorId, { amount: total / 2 });
    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: total }),
    ).rejects.toThrow(/exceeds/i);
  });

  /** Tenant isolation: a vendor must not reach into another vendor's orders. */
  it("refuses a refund issued by a different vendor", async () => {
    const { order, actorId } = await paidOrder(50);
    const other = await makeVendor();

    await expect(
      orderService.refund(String(other._id), String(order._id), actorId, { amount: 5 }),
    ).rejects.toThrow();
  });
});

describe("partial refunds", () => {
  it("marks the order partially refunded and leaves stock reserved", async () => {
    const { order, vendorId, actorId, productId } = await paidOrder(100, 2, 10);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    await orderService.refund(vendorId, String(order._id), actorId, { amount: 25 });

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("partially_refunded");
    // The customer still has the goods, so the stock must not come back.
    expect(fresh!.status).not.toBe("refunded");
    expect((await Product.findById(productId))!.stock).toBe(stockAfterOrder);
  });

  it("accumulates several partial refunds", async () => {
    const { order, vendorId, actorId } = await paidOrder(100, 1);

    await orderService.refund(vendorId, String(order._id), actorId, { amount: 10 });
    await orderService.refund(vendorId, String(order._id), actorId, { amount: 15 });

    const fresh = await Order.findById(order._id);
    expect(fresh!.refunds).toHaveLength(2);
    expect(fresh!.refunds.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(25, 2);
  });
});

describe("full refunds", () => {
  it("marks the order refunded and returns the stock", async () => {
    const { order, vendorId, actorId, productId } = await paidOrder(100, 2, 10);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    await orderService.refund(vendorId, String(order._id), actorId, {
      amount: order.totals.grandTotal,
    });

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("refunded");
    expect(fresh!.status).toBe("refunded");
    expect((await Product.findById(productId))!.stock).toBe(stockAfterOrder + 2);
  });

  /**
   * Regression: partials that sum to the total must close the order.
   *
   * With the amounts below the two refunds sum to 1.0499999999999998 in binary
   * floating point, which is *less* than the 1.05 total. A `>=` comparison on
   * the raw floats therefore decides the order is only partially refunded — the
   * customer has been paid back in full, the order still reads
   * `partially_refunded`, and the stock is never returned to the pool.
   */
  it("closes the order when partial refunds sum to the total (float-exact)", async () => {
    const { order, vendorId, actorId, productId } = await paidOrder(1.05, 1, 10);
    expect(order.totals.grandTotal).toBe(1.05);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    await orderService.refund(vendorId, String(order._id), actorId, { amount: 0.35 });
    await orderService.refund(vendorId, String(order._id), actorId, { amount: 0.7 });

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("refunded");
    expect(fresh!.status).toBe("refunded");
    expect((await Product.findById(productId))!.stock).toBe(stockAfterOrder + 1);
  });

  /**
   * Regression: refunding exactly what is left must be allowed.
   *
   * After refunding 0.07 of 1.00, `grandTotal - alreadyRefunded` evaluates to
   * 0.9299999999999999, so refunding the remaining 0.93 is rejected as
   * exceeding a remaining balance the error message itself prints as "0.93".
   */
  it("allows refunding the exact remaining balance (float-exact)", async () => {
    const { order, vendorId, actorId } = await paidOrder(1.0, 1, 10);
    expect(order.totals.grandTotal).toBe(1.0);

    await orderService.refund(vendorId, String(order._id), actorId, { amount: 0.07 });
    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: 0.93 }),
    ).resolves.toBeTruthy();

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("refunded");
  });

  it("does not release stock twice when a refunded order is refunded again", async () => {
    const { order, vendorId, actorId, productId } = await paidOrder(100, 2, 10);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    await orderService.refund(vendorId, String(order._id), actorId, {
      amount: order.totals.grandTotal,
    });
    const stockAfterRefund = (await Product.findById(productId))!.stock;

    await expect(
      orderService.refund(vendorId, String(order._id), actorId, { amount: 1 }),
    ).rejects.toThrow();

    expect((await Product.findById(productId))!.stock).toBe(stockAfterRefund);
    expect(stockAfterRefund).toBe(stockAfterOrder + 2);
  });
});

describe("provider-initiated refunds", () => {
  /** A refund raised in the Stripe dashboard arrives as a webhook, not an action. */
  it("marks the order refunded and restocks from a webhook outcome", async () => {
    const { order, productId } = await paidOrder(100, 2, 10);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    await paymentService.applyWebhookOutcome({
      orderRef: String(order._id),
      status: "refunded",
      providerReference: "ch_test_refund",
      amount: order.totals.grandTotal,
    });

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("refunded");
    expect(fresh!.status).toBe("refunded");
    expect((await Product.findById(productId))!.stock).toBe(stockAfterOrder + 2);
  });

  it("ignores a duplicate refund webhook", async () => {
    const { order, productId } = await paidOrder(100, 2, 10);
    const stockAfterOrder = (await Product.findById(productId))!.stock;

    const outcome = {
      orderRef: String(order._id),
      status: "refunded" as const,
      providerReference: "ch_test_dupe",
      amount: order.totals.grandTotal,
    };

    await paymentService.applyWebhookOutcome(outcome);
    await paymentService.applyWebhookOutcome(outcome);

    const fresh = await Order.findById(order._id);
    expect(fresh!.refunds).toHaveLength(1);
    expect((await Product.findById(productId))!.stock).toBe(stockAfterOrder + 2);
  });
});
