import { walletService } from "@/server/services/wallet.service";
import type { WalletTxnDoc } from "@/server/database/models/wallet.model";
import { cents, toMajor } from "@/shared/lib/money";

export type WalletTxnView = {
  id: string;
  type: "credit" | "debit";
  amount: number;
  balanceAfter: number;
  reason: string;
  reference: string | null;
  createdAt: string;
};

function toView(txn: WalletTxnDoc): WalletTxnView {
  return {
    id: String(txn._id),
    type: txn.type as "credit" | "debit",
    amount: toMajor(cents(txn.amount)),
    balanceAfter: toMajor(cents(txn.balanceAfter)),
    reason: txn.reason,
    reference: txn.reference ?? null,
    createdAt: txn.createdAt.toISOString(),
  };
}

export async function getWalletView(userId: string): Promise<{ balance: number; history: WalletTxnView[] }> {
  const [balance, history] = await Promise.all([
    walletService.getBalance(userId),
    walletService.history(userId),
  ]);
  return { balance, history: history.map(toView) };
}
