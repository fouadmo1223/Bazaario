"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { reorderAction, type ReorderResult } from "../actions";

/**
 * "Buy again" — re-adds a past order's items to the cart for that vendor.
 *
 * Best-effort, not all-or-nothing: a line that is discontinued or sold out
 * since the order shipped is reported rather than blocking the rest, which is
 * why the result is a summary panel rather than a redirect straight to cart.
 */
export function ReorderButton({ orderId }: { orderId: string }) {
  const t = useTranslations("Reorder");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ReorderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reorder() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await reorderAction(orderId);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setResult(res.data);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={reorder}
        disabled={pending}
        className="rounded-xl border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        {pending ? t("addingToCart") : t("buyAgain")}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-xl border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          {result.added > 0 ? (
            <p className="text-zinc-700 dark:text-zinc-300">
              {t("addedItems", { count: result.added })}{" "}
              <Link
                href={`/v/${result.vendorSlug}/cart`}
                className="font-medium text-brand hover:underline dark:text-brand"
              >
                {t("viewCart")}
              </Link>
            </p>
          ) : (
            <p className="text-zinc-500">{t("noneAvailable")}</p>
          )}
          {result.skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  {s.title} — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
