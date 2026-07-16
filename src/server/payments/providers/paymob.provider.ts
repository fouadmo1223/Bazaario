import { createHmac } from "node:crypto";
import type { PaymentProvider, PaymentInitResult, WebhookOutcome } from "../types";
import type { OrderDoc } from "@/server/database/models/order.model";
import { getServerEnv } from "@/shared/config/env";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";

const BASE = "https://accept.paymob.com/api";

/**
 * Paymob (Egypt) three-step flow: auth token → order registration → payment key,
 * then redirect to the hosted iframe. Callbacks are verified with an HMAC over a
 * fixed, lexicographically-ordered field list (per Paymob's spec).
 */
export class PaymobProvider implements PaymentProvider {
  readonly id = "paymob" as const;

  isEnabled(): boolean {
    const env = getServerEnv();
    return Boolean(env.PAYMOB_API_KEY && env.PAYMOB_HMAC_SECRET);
  }

  private async authToken(): Promise<string> {
    const apiKey = getServerEnv().PAYMOB_API_KEY;
    if (!apiKey) throw Errors.badRequest("Paymob is not configured");

    const res = await fetch(`${BASE}/auth/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!res.ok) throw Errors.payment("Paymob authentication failed");
    const { token } = (await res.json()) as { token: string };
    return token;
  }

  // `returnUrl` is unused by design: Paymob takes the post-payment redirect from
  // the integration's dashboard settings, not from the payment-key request.
  async initiate(order: OrderDoc, _opts: { returnUrl: string }): Promise<PaymentInitResult> {
    const token = await this.authToken();
    const amountCents = Math.round(order.totals.grandTotal * 100);

    // 2) Register the order with Paymob.
    const orderRes = await fetch(`${BASE}/ecommerce/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        delivery_needed: true,
        amount_cents: amountCents,
        currency: order.currency,
        merchant_order_id: `${order.number}-${Date.now()}`, // must be unique per attempt
        items: order.items.map((i) => ({
          name: i.title,
          amount_cents: Math.round(i.unitPrice * 100),
          quantity: i.quantity,
        })),
      }),
    });
    if (!orderRes.ok) throw Errors.payment("Paymob order registration failed");
    const paymobOrder = (await orderRes.json()) as { id: number };

    // 3) Request a payment key for the iframe.
    const addr = order.shipping?.address;
    const keyRes = await fetch(`${BASE}/acceptance/payment_keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: paymobOrder.id,
        currency: order.currency,
        integration_id: Number(process.env.PAYMOB_INTEGRATION_ID ?? 0),
        billing_data: {
          first_name: addr?.recipient?.split(" ")[0] ?? "NA",
          last_name: addr?.recipient?.split(" ").slice(1).join(" ") || "NA",
          phone_number: addr?.phone ?? "NA",
          email: order.guestEmail ?? "NA",
          street: addr?.line1 ?? "NA",
          city: addr?.city ?? "NA",
          country: addr?.country ?? "EG",
          apartment: "NA", floor: "NA", building: "NA", shipping_method: "NA",
          postal_code: addr?.postalCode ?? "NA", state: addr?.region ?? "NA",
        },
      }),
    });
    if (!keyRes.ok) throw Errors.payment("Paymob payment key request failed");
    const { token: paymentKey } = (await keyRes.json()) as { token: string };

    const iframeId = process.env.PAYMOB_IFRAME_ID ?? "";
    return {
      provider: "paymob",
      redirectUrl: `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`,
      reference: String(paymobOrder.id),
      settled: false,
    };
  }

  /**
   * Paymob HMAC is computed over these fields concatenated in this exact order.
   * Any deviation produces a mismatch, so the list is intentionally explicit.
   */
  private static readonly HMAC_FIELDS = [
    "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
    "id", "integration_id", "is_3d_secure", "is_auth", "is_capture",
    "is_refunded", "is_standalone_payment", "is_voided", "order.id", "owner",
    "pending", "source_data.pan", "source_data.sub_type", "source_data.type", "success",
  ];

  private static pick(obj: Record<string, unknown>, path: string): string {
    const value = path.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], obj);
    return String(value ?? "");
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome | null> {
    const secret = getServerEnv().PAYMOB_HMAC_SECRET;
    if (!secret) throw Errors.badRequest("Paymob HMAC secret is not configured");

    const payload = JSON.parse(rawBody) as { obj?: Record<string, unknown>; hmac?: string };
    const obj = payload.obj;
    if (!obj) return null;

    const received = payload.hmac ?? headers["hmac"] ?? "";
    const concatenated = PaymobProvider.HMAC_FIELDS.map((f) => PaymobProvider.pick(obj, f)).join("");
    const expected = createHmac("sha512", secret).update(concatenated).digest("hex");

    if (expected !== received) {
      logger.warn("Paymob HMAC verification failed");
      throw Errors.unauthorized("Invalid webhook signature");
    }

    const success = obj.success === true || obj.success === "true";
    const refunded = obj.is_refunded === true;
    const merchantOrderId = String(
      (obj.order as Record<string, unknown>)?.merchant_order_id ?? "",
    );

    return {
      orderRef: merchantOrderId.split("-")[0], // our order number
      status: refunded ? "refunded" : success ? "paid" : "failed",
      providerReference: String(obj.id ?? ""),
      amount: Number(obj.amount_cents ?? 0) / 100,
    };
  }
}
