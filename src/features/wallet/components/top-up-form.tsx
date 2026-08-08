"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { initiateTopUpAction } from "../actions";

/**
 * Redirects to Stripe Checkout — the balance only changes once the webhook
 * confirms payment, never on this return trip, so there's nothing to show
 * here but "funds are on the way" copy on the ?status=success bounce-back.
 */
export function TopUpForm() {
  const t = useTranslations("TopUpForm");
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("25");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError(t("amountError"));
      return;
    }

    startTransition(async () => {
      const result = await initiateTopUpAction(value);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      window.location.href = result.data.url;
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="topup-amount" className="block text-sm font-medium text-text-secondary">
          {t("addFunds")}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-text-tertiary">$</span>
          <input
            id="topup-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm tabular-nums text-foreground focus:border-brand focus:outline-none"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
      >
        {pending ? t("redirecting") : t("payWithCard")}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
