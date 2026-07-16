"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerCancelOrderAction } from "../actions";

/**
 * Customer-initiated cancellation. Only offered while an order is still
 * `pending`; the server re-checks that, so a stale page cannot cancel an order
 * that has since shipped.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await customerCancelOrderAction(orderId);
      if (!result.ok) {
        setError(result.error.message);
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Cancel this order?</p>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          Cancel order
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
