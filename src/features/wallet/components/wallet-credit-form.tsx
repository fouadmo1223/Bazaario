"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { creditWalletAction } from "../actions";

/** Vendor staff issuing store credit to the customer on this order. */
export function WalletCreditForm({
  vendorId,
  orderId,
  customerId,
}: {
  vendorId: string;
  orderId: string;
  customerId: string;
}) {
  const t = useTranslations("WalletCreditForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("amountError"));
      return;
    }

    startTransition(async () => {
      const result = await creditWalletAction(vendorId, orderId, customerId, value, reason);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDone(result.data.balance);
      setOpen(false);
      setAmount("");
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-raised"
        >
          {t("creditWallet")}
        </button>
        {done != null && (
          <p className="mt-2 text-sm text-text-tertiary">{t("newBalance", { balance: done.toFixed(2) })}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="wallet-amount" className="block text-sm font-medium text-text-secondary">
          {t("amount")}
        </label>
        <input
          id="wallet-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm tabular-nums text-foreground focus:border-brand focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="wallet-reason" className="block text-sm font-medium text-text-secondary">
          {t("reasonOptional")}
        </label>
        <input
          id="wallet-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground focus:border-brand focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
        >
          {pending ? t("crediting") : t("confirmCredit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
