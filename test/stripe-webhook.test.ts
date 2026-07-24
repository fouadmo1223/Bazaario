import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { getProvider } from "@/server/payments/registry";
import { paymentService } from "@/server/services/payment.service";
import { checkoutService } from "@/server/services/checkout.service";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { Product } from "@/server/database/models/product.model";
import { makeUser, makeVendor, makeProduct, makeCart, testAddress } from "./factories";

/**
 * Stripe webhook handling: signature verification, and idempotency.
 *
 * These are money paths that are invisible on screen. A broken catalogue page
 * is obvious; a webhook that double-counts revenue on a retry looks completely
 * normal until the books do not reconcile. Stripe retries on any non-2xx and
 * can deliver the same event more than once even on success, so duplicate
 * delivery is the expected case, not the edge case.
 *
 * No network is involved — `constructEvent` is HMAC verification — so these run
 * anywhere, including CI with a dummy key.
 */

const SECRET = "whsec_test_secret_for_signature_checks";

/** Build the `Stripe-Signature` header exactly as Stripe does. */
function signature(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const hmac = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

function completedEvent(orderId: string, sessionId: string, amountMinor: number) {
  return JSON.stringify({
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        amount_total: amountMinor,
        currency: "usd",
        client_reference_id: orderId,
        metadata: { orderId },
        payment_status: "paid",
      },
    },
  });
}

/** The whole path a real delivery takes, minus the HTTP layer. */
async function deliver(rawBody: string, sig: string) {
  const outcome = await getProvider("stripe").parseWebhook(rawBody, { "stripe-signature": sig });
  if (outcome) await paymentService.applyWebhookOutcome(outcome);
  return outcome;
}

async function pendingOrder(): Promise<{ order: OrderDoc; vendorId: string }> {
  const vendor = await makeVendor();
  const user = await makeUser();
  const product = await makeProduct(vendor._id, { stock: 5, price: 100 });
  await makeCart(vendor._id, user._id, product, 1);

  const order = await checkoutService.createOrder(
    String(vendor._id),
    { userId: String(user._id) },
    { paymentProvider: "stripe", address: testAddress },
  );
  return { order, vendorId: String(vendor._id) };
}

describe("stripe webhook signature", () => {
  it("rejects a payload signed with the wrong secret", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_1", 10000);

    await expect(deliver(body, signature(body, "whsec_not_the_secret"))).rejects.toThrow();

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("pending");
  });

  /** The attack the signature exists to stop: replaying a real event with an edited amount. */
  it("rejects a body tampered with after signing", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_2", 10000);
    const sig = signature(body);
    const tampered = body.replace('"amount_total":10000', '"amount_total":1');

    await expect(deliver(tampered, sig)).rejects.toThrow();

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("pending");
  });

  it("rejects a request with no signature header at all", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_3", 10000);

    await expect(
      getProvider("stripe").parseWebhook(body, {}),
    ).rejects.toThrow();
  });

  /**
   * Stripe's own tolerance check. Without it a signature captured from a log
   * stays valid forever.
   */
  it("rejects a signature older than the replay tolerance", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_4", 10000);
    const longAgo = Math.floor(Date.now() / 1000) - 60 * 60;

    await expect(deliver(body, signature(body, SECRET, longAgo))).rejects.toThrow();
  });

  it("ignores event types it does not handle", async () => {
    const body = JSON.stringify({
      id: "evt_unrelated",
      object: "event",
      type: "customer.created",
      data: { object: { id: "cus_1" } },
    });

    await expect(deliver(body, signature(body))).resolves.toBeNull();
  });
});

describe("stripe webhook fulfillment", () => {
  it("marks the order paid and records the provider reference", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_paid", 10000);

    await deliver(body, signature(body));

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("paid");
    expect(fresh!.status).toBe("paid");
    expect(fresh!.payment.reference).toBe("cs_test_paid");
    expect(fresh!.payment.paidAt).toBeTruthy();
    expect(fresh!.timeline.map((t) => t.status)).toContain("paid");
  });

  it("marks the order paid once", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_rev", 10000);

    await deliver(body, signature(body));

    const fresh = await Order.findById(order._id);
    expect(fresh!.payment.status).toBe("paid");
    expect(fresh!.timeline.filter((t) => t.status === "paid")).toHaveLength(1);
  });

  /**
   * The one that matters most. Stripe retries, so this *will* happen in
   * production, and the capture must be idempotent. The signal is the order
   * itself: capturing twice would push a second "paid" onto the timeline. (This
   * used to also assert vendor revenue did not double, back when a `stats.revenue`
   * counter was `$inc`'d here — that counter was removed for drifting unread, so
   * the timeline is now the sole record, which is exactly why it must not grow.)
   */
  it("counts a duplicate delivery exactly once", async () => {
    const { order } = await pendingOrder();
    const body = completedEvent(String(order._id), "cs_test_dupe", 10000);
    const sig = signature(body);

    await deliver(body, sig);
    const timelineAfterFirst = (await Order.findById(order._id))!.timeline.length;

    await deliver(body, sig);
    await deliver(body, sig);

    const fresh = await Order.findById(order._id);

    expect(fresh!.timeline).toHaveLength(timelineAfterFirst);
    expect(fresh!.timeline.filter((t) => t.status === "paid")).toHaveLength(1);
    expect(fresh!.payment.status).toBe("paid");
  });

  it("does nothing for an event referencing an unknown order", async () => {
    const body = completedEvent("6a5e5a8c808217f1e9088d1f", "cs_test_orphan", 10000);

    // Swallowed rather than thrown: a 4xx would make Stripe retry an event that
    // can never succeed, forever.
    await expect(deliver(body, signature(body))).resolves.toBeTruthy();
  });

  /** A failed payment must give the stock back, or it is lost until someone notices. */
  it("releases reserved stock when the payment fails", async () => {
    const vendor = await makeVendor();
    const user = await makeUser();
    const product = await makeProduct(vendor._id, { stock: 5, price: 100 });
    await makeCart(vendor._id, user._id, product, 2);

    const order = await checkoutService.createOrder(
      String(vendor._id),
      { userId: String(user._id) },
      { paymentProvider: "stripe", address: testAddress },
    );

    expect((await Product.findById(product._id))!.stock).toBe(3);

    const body = JSON.stringify({
      id: "evt_failed",
      object: "event",
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_test_failed", metadata: { orderId: String(order._id) } } },
    });

    await deliver(body, signature(body));

    expect((await Product.findById(product._id))!.stock).toBe(5);
    expect((await Order.findById(order._id))!.payment.status).toBe("failed");
  });
});
