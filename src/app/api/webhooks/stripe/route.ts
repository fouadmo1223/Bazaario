import type { NextRequest } from "next/server";
import { getProvider } from "@/server/payments/registry";
import { paymentService } from "@/server/services/payment.service";
import { logger } from "@/shared/lib/logger";

/**
 * Stripe webhook. MUST read the raw body — `request.json()` would reparse and
 * break signature verification. Always returns 200 on handled events so Stripe
 * stops retrying; genuine failures return 4xx/5xx to trigger a retry.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  try {
    const outcome = await getProvider("stripe").parseWebhook(rawBody, headers);
    if (outcome) await paymentService.applyWebhookOutcome(outcome);
    return Response.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Stripe webhook processing failed");
    // 400 → Stripe retries with backoff.
    return Response.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
