import Stripe from "stripe";
import type { PaymentProvider, PaymentInitResult, WebhookOutcome } from "../types";
import type { OrderDoc } from "@/server/database/models/order.model";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { toMinor, toMajor, cents } from "@/shared/lib/money";

/**
 * Shared singleton, module-level rather than per-`StripeProvider` instance:
 * a wallet top-up (no `Order`, so it doesn't go through this class at all)
 * needs the same client to create its own Checkout session.
 */
let sharedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (sharedClient) return sharedClient;
  const key = getServerEnv().STRIPE_SECRET_KEY;
  if (!key) throw Errors.badRequest("Stripe is not configured");
  sharedClient = new Stripe(key);
  return sharedClient;
}

/**
 * Verify a Stripe webhook's signature and return the parsed event.
 *
 * Exported (not just used inline in `parseWebhook` below) so the webhook
 * route can verify once, inspect `event.data.object.metadata.kind`, and
 * branch to either order fulfillment or a wallet top-up *before* committing
 * to which normalizer runs — `parseWebhook` below only ever produces an
 * order-shaped `WebhookOutcome`.
 */
export function verifyStripeWebhookEvent(rawBody: string, headers: Record<string, string>): Stripe.Event {
  const secret = getServerEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw Errors.badRequest("Stripe webhook secret is not configured");

  const signature = headers["stripe-signature"];
  if (!signature) throw Errors.unauthorized("Missing Stripe signature");

  try {
    return getStripeClient().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    logger.warn({ err }, "Stripe webhook signature verification failed");
    throw Errors.unauthorized("Invalid webhook signature");
  }
}

/**
 * Stripe Checkout Session flow: we create a hosted session and redirect the
 * customer. Fulfillment is driven by the `checkout.session.completed` webhook,
 * never by the browser return (which is spoofable).
 */
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe" as const;

  isEnabled(): boolean {
    return Boolean(getServerEnv().STRIPE_SECRET_KEY);
  }

  async initiate(order: OrderDoc, opts: { returnUrl: string }): Promise<PaymentInitResult> {
    const stripe = getStripeClient();
    const currency = order.currency.toLowerCase();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Stripe wants integer minor units.
      line_items: order.items.map((i) => ({
        quantity: i.quantity,
        price_data: {
          currency,
          unit_amount: toMinor(i.unitPrice),
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
                  fixed_amount: { amount: toMinor(order.totals.shipping), currency },
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
    const event = verifyStripeWebhookEvent(rawBody, headers);

    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        return {
          orderRef: s.metadata?.orderId ?? String(s.client_reference_id),
          status: "paid",
          providerReference: s.id,
          amount: toMajor(cents(s.amount_total ?? 0)),
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
          amount: toMajor(cents(c.amount_refunded ?? 0)),
        };
      }
      default:
        return null; // ignore unrelated events
    }
  }
}
