import type { NextRequest } from "next/server";
import { getProvider } from "@/server/payments/registry";
import { paymentService } from "@/server/services/payment.service";
import { logger } from "@/shared/lib/logger";

/**
 * Paymob callback. HMAC is verified over the raw payload before any state change.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => (headers[k] = v));

  try {
    const outcome = await getProvider("paymob").parseWebhook(rawBody, headers);
    if (outcome) await paymentService.applyWebhookOutcome(outcome);
    return Response.json({ received: true });
  } catch (err) {
    logger.error({ err }, "Paymob webhook processing failed");
    return Response.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
