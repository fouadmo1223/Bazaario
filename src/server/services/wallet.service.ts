import { connectToDatabase } from "@/server/database/connection";
import { Wallet, WalletTxn, type WalletTxnDoc } from "@/server/database/models/wallet.model";
import { Errors } from "@/shared/lib/errors";
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
};
