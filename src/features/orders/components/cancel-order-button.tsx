"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { customerCancelOrderAction } from "../actions";

/**
 * Customer-initiated cancellation. Only offered while an order is still
 * `pending`; the server re-checks that, so a stale page cannot cancel an order
 * that has since shipped.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("CancelOrder");
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
          <p className="text-sm text-text-secondary">{t("cancelThisOrder")}</p>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? t("cancelling") : t("yesCancel")}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
          >
            {t("keepIt")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-secondary transition hover:border-red-400 hover:text-red-600"
        >
          {t("cancelOrder")}
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
