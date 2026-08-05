import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyStripeWebhookEvent } from "@/server/payments/providers/stripe.provider";
import { walletService } from "@/server/services/wallet.service";
import { makeUser } from "./factories";

/**
 * Wallet top-up webhook handling — the same signature/idempotency concerns
 * as order payments (test/stripe-webhook.test.ts), pinned separately because
 * a top-up shares the Stripe account but has no `Order` to look up by; it's
 * a different code path (`walletService.applyTopUpWebhook`), not a variant
 * of `applyWebhookOutcome`.
 */

const SECRET = "whsec_test_secret_for_signature_checks";

function signature(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const hmac = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

function topUpEvent(userId: string, sessionId: string, amountMinor: number) {
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
        metadata: { kind: "wallet_topup", userId },
        payment_status: "paid",
      },
    },
  });
}

async function deliver(rawBody: string, sig: string) {
  const event = verifyStripeWebhookEvent(rawBody, { "stripe-signature": sig });
  await walletService.applyTopUpWebhook(event);
}

describe("wallet top-up webhook", () => {
  it("credits the wallet for the session amount", async () => {
    const user = await makeUser();
    const body = topUpEvent(String(user._id), "cs_topup_1", 2500);

    await deliver(body, signature(body));

    expect(await walletService.getBalance(String(user._id))).toBe(25);
  });

  /** Stripe retries; a duplicate delivery must not double-credit. */
  it("credits exactly once for a duplicate delivery", async () => {
    const user = await makeUser();
    const body = topUpEvent(String(user._id), "cs_topup_dupe", 1000);
    const sig = signature(body);

    await deliver(body, sig);
    await deliver(body, sig);
    await deliver(body, sig);

    expect(await walletService.getBalance(String(user._id))).toBe(10);
    const history = await walletService.history(String(user._id));
    expect(history).toHaveLength(1);
  });

  /**
   * The reason this is its own code path: an order-payment event has no
   * `metadata.kind`, so it must fall through untouched rather than being
   * mistaken for a top-up (or vice versa — `applyWebhookOutcome` never sees
   * a top-up event at all, tested on the other side in stripe-webhook.test.ts).
   */
  it("ignores an event with no wallet_topup metadata", async () => {
    const user = await makeUser();
    const body = JSON.stringify({
      id: "evt_order_shaped",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_order_shaped", amount_total: 5000, metadata: { orderId: "not-a-topup" } },
      },
    });

    await deliver(body, signature(body));

    expect(await walletService.getBalance(String(user._id))).toBe(0);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const user = await makeUser();
    const body = topUpEvent(String(user._id), "cs_topup_bad_sig", 1000);

    expect(() =>
      verifyStripeWebhookEvent(body, { "stripe-signature": signature(body, "whsec_not_the_secret") }),
    ).toThrow();
  });
});

describe("initiateTopUp", () => {
  it("refuses a non-positive amount before ever contacting Stripe", async () => {
    const user = await makeUser();
    await expect(
      walletService.initiateTopUp(String(user._id), 0, "http://localhost:3001/account/wallet"),
    ).rejects.toThrow();
  });
});
