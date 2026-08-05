import type Stripe from "stripe";
import { connectToDatabase } from "@/server/database/connection";
import { Wallet, WalletTxn, type WalletTxnDoc } from "@/server/database/models/wallet.model";
import { getStripeClient } from "@/server/payments/providers/stripe.provider";
import { getRedis } from "@/server/cache/redis";
import { Errors } from "@/shared/lib/errors";
import { logger } from "@/shared/lib/logger";
import { toMinor, toMajor, cents } from "@/shared/lib/money";
import { writeAudit } from "./audit.service";

/**
 * Platform-wide store credit. Every amount in/out is major units (dollars) at
 * the edges — same convention as `order.totals` — and minor units (cents)
 * internally, so balance arithmetic never touches a float.
 */
export const walletService = {
  async getBalance(userId: string): Promise<number> {
    await connectToDatabase();
    const wallet = await Wallet.findOne({ user: userId }).select("balance");
    return toMajor(cents(wallet?.balance ?? 0));
  },

  /**
   * Add funds. `issuedBy` is the vendor/admin staff member granting it —
   * null only for a system-issued credit (e.g. compensating a failed debit).
   */
  async credit(userId: string, amountMajor: number, reason: string, issuedBy: string | null): Promise<WalletTxnDoc> {
    if (amountMajor <= 0) throw Errors.badRequest("Credit amount must be positive");
    await connectToDatabase();

    const amount = toMinor(amountMajor);
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: amount } },
      { upsert: true, new: true },
    );

    const txn = await WalletTxn.create({
      user: userId, type: "credit", amount, balanceAfter: wallet.balance,
      reason, issuedBy,
    });
    await writeAudit({
      actor: issuedBy, action: "wallet.credit", entity: "WalletTxn",
      entityId: String(txn._id), diff: { user: userId, amount: amountMajor, reason },
    });
    return txn;
  },

  /**
   * Take funds, atomically. The `balance: { $gte: amount }` filter is what
   * makes this safe — mirrors `checkout.service`'s stock-reservation guard:
   * the read and the write are one operation, so two concurrent debits can't
   * both succeed against a balance that only covers one of them.
   */
  async debit(userId: string, amountMajor: number, reason: string, reference: string | null = null): Promise<WalletTxnDoc> {
    if (amountMajor <= 0) throw Errors.badRequest("Debit amount must be positive");
    await connectToDatabase();

    const amount = toMinor(amountMajor);
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );
    if (!wallet) throw Errors.badRequest("Insufficient wallet balance");

    const txn = await WalletTxn.create({
      user: userId, type: "debit", amount, balanceAfter: wallet.balance,
      reason, reference,
    });
    return txn;
  },

  /** Recent activity for the account page. */
  async history(userId: string, limit = 50): Promise<WalletTxnDoc[]> {
    await connectToDatabase();
    return WalletTxn.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).exec();
  },

  /**
   * Start a card top-up. Deliberately not a `PaymentProvider` — there's no
   * `Order` here for `initiate(order, opts)` to read from, so this creates
   * its own Checkout session directly, tagged `metadata.kind: "wallet_topup"`
   * so the webhook route can tell it apart from an order payment using the
   * same Stripe account.
   */
  async initiateTopUp(userId: string, amountMajor: number, returnUrl: string): Promise<{ url: string }> {
    if (amountMajor <= 0) throw Errors.badRequest("Enter an amount greater than zero");

    const stripe = getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: toMinor(amountMajor),
            product_data: { name: "Wallet top-up" },
          },
        },
      ],
      success_url: `${returnUrl}?status=success`,
      cancel_url: `${returnUrl}?status=cancelled`,
      metadata: { kind: "wallet_topup", userId },
    });
    if (!session.url) throw Errors.badRequest("Could not start checkout");
    return { url: session.url };
  },

  /**
   * Apply a completed top-up exactly once. Mirrors `payment.service`'s
   * `applyWebhookOutcome` idempotency (`SET NX`, 24h), keyed by session id
   * rather than shared with order webhooks — a top-up has no order to look
   * up by. The browser return is never trusted for this, same reasoning as
   * order fulfillment: only the webhook credits the wallet.
   */
  async applyTopUpWebhook(event: Stripe.Event): Promise<void> {
    if (event.type !== "checkout.session.completed") return;
    const session = event.data.object;
    if (session.metadata?.kind !== "wallet_topup") return;

    const userId = session.metadata.userId;
    if (!userId) return;

    const idemKey = `webhook:${session.id}:wallet_topup`;
    const first = await getRedis().set(idemKey, "1", "EX", 86400, "NX");
    if (!first) {
      logger.info({ idemKey }, "Duplicate wallet top-up webhook ignored");
      return;
    }

    const amountMajor = toMajor(cents(session.amount_total ?? 0));
    if (amountMajor <= 0) return;

    await this.credit(userId, amountMajor, "Wallet top-up via card", null);
    logger.info({ userId, amountMajor }, "Wallet top-up applied");
  },
};
