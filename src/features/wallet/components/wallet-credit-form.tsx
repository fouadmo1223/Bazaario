"use client";

import { useState, useTransition } from "react";
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
      setError("Enter an amount greater than zero.");
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
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          Credit wallet…
        </button>
        {done != null && (
          <p className="mt-2 text-sm text-zinc-500">New balance: {done.toFixed(2)}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="wallet-amount" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Amount
        </label>
        <input
          id="wallet-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </div>

      <div>
        <label htmlFor="wallet-reason" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Reason (optional)
        </label>
        <input
          id="wallet-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
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
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Crediting…" : "Confirm credit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
