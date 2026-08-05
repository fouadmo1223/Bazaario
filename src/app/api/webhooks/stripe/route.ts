import type { NextRequest } from "next/server";
import { getProvider } from "@/server/payments/registry";
import { verifyStripeWebhookEvent } from "@/server/payments/providers/stripe.provider";
import { paymentService } from "@/server/services/payment.service";
import { walletService } from "@/server/services/wallet.service";
import { logger } from "@/shared/lib/logger";

/**
 * Stripe webhook. MUST read the raw body — `request.json()` would reparse and
 * break signature verification. Always returns 200 on handled events so Stripe
 * stops retrying; genuine failures return 4xx/5xx to trigger a retry.
 *
 * One account, two kinds of Checkout session: an order payment and a wallet
 * top-up (no `Order` document at all). The signature is verified once here to
 * read `metadata.kind` and branch — a wallet top-up never reaches
 * `parseWebhook`/`applyWebhookOutcome`, which are order-shaped throughout and
 * would just log "unknown order" and drop it.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  try {
    const event = verifyStripeWebhookEvent(rawBody, headers);
    const isWalletTopUp =
      event.type === "checkout.session.completed" && event.data.object.metadata?.kind === "wallet_topup";

    if (isWalletTopUp) {
      await walletService.applyTopUpWebhook(event);
    } else {
      const outcome = await getProvider("stripe").parseWebhook(rawBody, headers);
      if (outcome) await paymentService.applyWebhookOutcome(outcome);
    }
    return Response.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Stripe webhook processing failed");
    // 400 → Stripe retries with backoff.
    return Response.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
