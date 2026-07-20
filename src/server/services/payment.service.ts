import { connectToDatabase } from "@/server/database/connection";
import { Order, type OrderDoc } from "@/server/database/models/order.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { Product } from "@/server/database/models/product.model";
import { Variant } from "@/server/database/models/variant.model";
import { getProvider } from "@/server/payments/registry";
import type { PaymentProviderId, WebhookOutcome, PaymentInitResult } from "@/server/payments/types";
import { getRedis } from "@/server/cache/redis";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { writeAudit } from "./audit.service";

/**
 * Payment orchestration. Webhooks are the source of truth for capture, and are
 * processed idempotently — providers retry aggressively and may deliver the same
 * event many times.
 */
export const paymentService = {
  async initiate(orderId: string, returnUrl: string): Promise<PaymentInitResult> {
    await connectToDatabase();
    const order = await Order.findById(orderId);
    if (!order) throw Errors.notFound("Order not found");
    if (order.payment.status === "paid") throw Errors.conflict("Order is already paid");

    const provider = getProvider(order.payment.provider as PaymentProviderId);
    const result = await provider.initiate(order, { returnUrl });

    if (result.reference) {
      order.payment.reference = result.reference;
      await order.save();
    }
    return result;
  },

  /**
   * Apply a normalized webhook outcome to an order exactly once.
   * Idempotency key = provider reference + status, held in Redis for 24h.
   */
  async applyWebhookOutcome(outcome: WebhookOutcome): Promise<void> {
    await connectToDatabase();
    const redis = getRedis();
    const idemKey = `webhook:${outcome.providerReference}:${outcome.status}`;

    // SET NX returns null when the key already exists → duplicate delivery.
    const first = await redis.set(idemKey, "1", "EX", 86400, "NX");
    if (!first) {
      logger.info({ idemKey }, "Duplicate webhook ignored");
      return;
    }

    // orderRef may be our ObjectId (Stripe metadata) or order number (Paymob).
    const order =
      (await Order.findById(outcome.orderRef).catch(() => null)) ??
      (await Order.findOne({ number: outcome.orderRef }));
    if (!order) {
      logger.warn({ ref: outcome.orderRef }, "Webhook for unknown order");
      return;
    }

    if (outcome.status === "paid") {
      if (order.payment.status === "paid") return; // already captured
      order.payment.status = "paid";
      order.payment.paidAt = new Date();
      order.payment.reference = outcome.providerReference;
      order.status = "paid";
      order.timeline.push({ status: "paid", note: "Payment captured", at: new Date() });
      /**
       * Denormalized running total. Two caveats before anyone relies on it:
       *
       * 1. It is currently **written but never read** — `analytics.service`
       *    computes revenue by aggregating `totals.grandTotal` over orders,
       *    which is the authoritative figure.
       * 2. `$inc` accumulates floats *inside Mongo*, so this drifts by a
       *    fraction of a cent per order and cannot be corrected from here the
       *    way JS-side arithmetic can (see shared/lib/money.ts).
       *
       * Displaying this without first making it exact — storing minor units, or
       * dropping it in favour of the aggregation — would show a number that
       * slowly diverges from the orders it claims to summarize.
       */
      await Vendor.updateOne(
        { _id: order.vendor },
        { $inc: { "stats.revenue": order.totals.grandTotal } },
      );
    } else if (outcome.status === "failed") {
      order.payment.status = "failed";
      order.timeline.push({ status: "pending", note: "Payment failed", at: new Date() });
      await this.releaseInventory(order);
    } else if (outcome.status === "refunded") {
      order.payment.status = "refunded";
      order.status = "refunded";
      order.refunds.push({
        amount: outcome.amount ?? order.totals.grandTotal,
        reason: "Provider refund",
        reference: outcome.providerReference,
        at: new Date(),
      });
      order.timeline.push({ status: "refunded", note: "Payment refunded", at: new Date() });
      await this.releaseInventory(order);
    }

    await order.save();
    await writeAudit({
      vendor: String(order.vendor),
      action: `payment.${outcome.status}`,
      entity: "Order",
      entityId: String(order._id),
      diff: { reference: outcome.providerReference, amount: outcome.amount },
    });
    logger.info({ orderId: String(order._id), status: outcome.status }, "Payment webhook applied");
  },

  /** Return reserved stock to the pool (payment failure / refund / cancellation). */
  async releaseInventory(order: OrderDoc): Promise<void> {
    for (const item of order.items) {
      if (item.variant) {
        await Variant.updateOne({ _id: item.variant }, { $inc: { stock: item.quantity } });
      } else {
        await Product.updateOne(
          { _id: item.product },
          { $inc: { stock: item.quantity, soldCount: -item.quantity } },
        );
      }
    }
  },
};
