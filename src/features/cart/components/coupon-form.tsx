"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { applyCouponAction, removeCouponAction } from "../actions";

/** Apply or clear a coupon. The discount itself is always computed server-side. */
export function CouponForm({
  vendorId,
  vendorSlug,
  applied,
}: {
  vendorId: string;
  vendorSlug: string;
  applied: string | null;
}) {
  const t = useTranslations("Checkout");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await applyCouponAction(vendorId, vendorSlug, { code });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setCode("");
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCouponAction(vendorId, vendorSlug);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900 dark:bg-emerald-950">
        <p className="text-sm text-emerald-800 dark:text-emerald-300">
          {t("couponApplied", { code: applied })}
        </p>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="text-sm text-emerald-800 underline underline-offset-4 disabled:opacity-40 dark:text-emerald-300"
        >
          {t("remove")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={apply} noValidate>
      <label htmlFor="coupon" className="sr-only">
        {t("couponCode")}
      </label>
      <div className="flex gap-2">
        <input
          id="coupon"
          name="coupon"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("couponCode")}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-tertiary focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || code.trim().length === 0}
          className="shrink-0 rounded-lg border border-border-default px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-surface-raised disabled:opacity-40"
        >
          {pending ? t("applying") : t("apply")}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
