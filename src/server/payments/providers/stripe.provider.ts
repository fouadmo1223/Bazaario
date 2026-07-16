import Stripe from "stripe";
import type { PaymentProvider, PaymentInitResult, WebhookOutcome } from "../types";
import type { OrderDoc } from "@/server/database/models/order.model";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

/**
 * Stripe Checkout Session flow: we create a hosted session and redirect the
 * customer. Fulfillment is driven by the `checkout.session.completed` webhook,
 * never by the browser return (which is spoofable).
 */
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;
  private client: Stripe | null = null;

  private getClient(): Stripe {
    if (this.client) return this.client;
    const key = getServerEnv().STRIPE_SECRET_KEY;
    if (!key) throw Errors.badRequest("Stripe is not configured");
    this.client = new Stripe(key);
    return this.client;
  }

  isEnabled(): boolean {
    return Boolean(getServerEnv().STRIPE_SECRET_KEY);
  }

  async initiate(order: OrderDoc, opts: { returnUrl: string }): Promise<PaymentInitResult> {
    const stripe = this.getClient();
    const currency = order.currency.toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Stripe wants integer minor units.
      line_items: order.items.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(i.unitPrice * 100),
          product_data: { name: i.title, ...(i.image ? { images: [i.image] } : {}) },
        },
      })),
      // Discounts/tax/shipping are already reflected in our totals; add the delta
      // as a separate line so the Stripe total matches our grand total exactly.
      ...(order.totals.shipping > 0
        ? {
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount" as const,
                  fixed_amount: { amount: Math.round(order.totals.shipping * 100), currency },
                  display_name: order.shipping?.method ?? "Shipping",
                },
              },
            ],
          }
        : {}),
      success_url: `${opts.returnUrl}?status=success&order=${order.number}`,
      cancel_url: `${opts.returnUrl}?status=cancelled&order=${order.number}`,
      client_reference_id: String(order._id),
      metadata: { orderId: String(order._id), orderNumber: order.number, vendor: String(order.vendor) },
    });

    return {
      provider: "stripe",
      redirectUrl: session.url ?? undefined,
      reference: session.id,
      settled: false,
    };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome | null> {
    const secret = getServerEnv().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw Errors.badRequest("Stripe webhook secret is not configured");

    const signature = headers["stripe-signature"];
    if (!signature) throw Errors.unauthorized("Missing Stripe signature");

    let event: Stripe.Event;
    try {
      event = this.getClient().webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      throw Errors.unauthorized("Invalid webhook signature");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        return {
          orderRef: s.metadata?.orderId ?? String(s.client_reference_id),
          status: "paid",
          providerReference: s.id,
          amount: (s.amount_total ?? 0) / 100,
        };
      }
      case "checkout.session.async_payment_failed":
      case "payment_intent.payment_failed": {
        const o = event.data.object as { id: string; metadata?: Record<string, string> };
        return { orderRef: o.metadata?.orderId ?? "", status: "failed", providerReference: o.id };
      }
      case "charge.refunded": {
        const c = event.data.object;
        return {
          orderRef: c.metadata?.orderId ?? "",
          status: "refunded",
          providerReference: c.id,
          amount: (c.amount_refunded ?? 0) / 100,
        };
      }
      default:
        return null; // ignore unrelated events
    }
  }
}
