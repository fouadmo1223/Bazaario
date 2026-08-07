"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { refundOrderAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";

/**
 * Record a full or partial refund.
 *
 * `remaining` bounds the input for the operator's benefit; the service validates
 * the amount against what is actually left, so a tampered field cannot refund
 * more than the order is worth.
 */
export function RefundForm({
  vendorId,
  orderId,
  currency,
  remaining,
}: {
  vendorId: string;
  orderId: string;
  currency: string;
  remaining: number;
}) {
  const t = useTranslations("RefundForm");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (remaining <= 0) {
    return <p className="text-sm text-zinc-500">{t("fullyRefunded")}</p>;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("amountError"));
      return;
    }

    startTransition(async () => {
      const result = await refundOrderAction(vendorId, orderId, {
        amount: value,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300"
      >
        {t("refundEllipsis")}
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="refund-amount" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t("amount")}
        </label>
        <input
          id="refund-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={remaining}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <p className="mt-1 text-xs text-zinc-500">
          {t("upToRemaining", { amount: formatMoney(remaining, currency) })}
        </p>
      </div>

      <div>
        <label htmlFor="refund-reason" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t("reasonOptional")}
        </label>
        <input
          id="refund-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
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
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? t("refunding") : t("confirmRefund")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
