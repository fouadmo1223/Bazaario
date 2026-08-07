"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { CouponFormModal } from "./coupon-form-modal";
import { deleteCouponAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";
import type { CouponView, Option } from "../queries";

/**
 * Coupon management table.
 *
 * A client component because it owns the add/edit/delete dialog state. Each row
 * already carries the full coupon, so editing opens straight from the row — no
 * second fetch — which a handful of small coupons makes worth it.
 */
export function CouponTable({
  coupons,
  vendorId,
  currency,
  products,
  categories,
}: {
  coupons: CouponView[];
  vendorId: string;
  currency: string;
  products: Option[];
  categories: Option[];
}) {
  const t = useTranslations("CouponTable");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CouponView | null>(null);
  const [deleting, setDeleting] = useState<CouponView | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCouponAction(vendorId, deleting.id);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">{t("shown", { count: coupons.length })}</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          {t("newCoupon")}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {coupons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">{t("noCoupons")}</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            {t("createFirst")}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <Th>{t("colCode")}</Th>
                <Th>{t("colDiscount")}</Th>
                <Th>{t("colLimits")}</Th>
                <Th>{t("colWindow")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th className="text-right">{t("colActions")}</Th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3">
                    <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{c.code}</p>
                    <p className="text-xs text-zinc-500">{scopeLabel(c, t)}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {discountLabel(c, currency, t)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{limitLabel(c, t)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{windowLabel(c, t)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {c.isActive ? t("active") : t("off")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(c)}
                        className="text-xs text-zinc-500 hover:text-red-600 hover:underline"
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <CouponFormModal
          open
          onClose={() => setAdding(false)}
          vendorId={vendorId}
          products={products}
          categories={categories}
        />
      )}

      {editing && (
        <CouponFormModal
          open
          onClose={() => setEditing(null)}
          vendorId={vendorId}
          products={products}
          categories={categories}
          initial={editing}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("deleteCoupon")}
        description={deleting?.code}
        size="sm"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("deleteConfirm")}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            disabled={pending}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? t("deleting") : t("delete")}
          </button>
        </div>
      </Modal>
    </>
  );
}

type T = ReturnType<typeof useTranslations>;

function discountLabel(c: CouponView, currency: string, t: T): string {
  if (c.type === "free_shipping") return t("freeShipping");
  if (c.type === "percentage") {
    return c.maxDiscount != null
      ? t("percentOffCapped", { value: c.value, max: formatMoney(c.maxDiscount, currency) })
      : t("percentOff", { value: c.value });
  }
  return t("amountOff", { amount: formatMoney(c.value, currency) });
}

function scopeLabel(c: CouponView, t: T): string {
  const parts: string[] = [];
  if (c.appliesToProducts.length) parts.push(t("limitedToProducts", { count: c.appliesToProducts.length }));
  if (c.appliesToCategories.length) parts.push(t("limitedToCategories", { count: c.appliesToCategories.length }));
  return parts.length ? t("limitedTo", { parts: parts.join(" + ") }) : t("wholeCart");
}

function limitLabel(c: CouponView, t: T): string {
  const parts: string[] = [];
  if (c.usageLimit != null) parts.push(t("usedOfLimit", { used: c.usedCount, limit: c.usageLimit }));
  else if (c.usedCount > 0) parts.push(t("used", { count: c.usedCount }));
  if (c.perUserLimit != null) parts.push(t("perShopper", { count: c.perUserLimit }));
  return parts.length ? parts.join(" · ") : t("noLimit");
}

function windowLabel(c: CouponView, t: T): string {
  if (!c.startsAt && !c.expiresAt) return t("always");
  return `${c.startsAt ?? "—"} → ${c.expiresAt ?? "—"}`;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-medium text-zinc-500 ${className ?? ""}`}>
      {children}
    </th>
  );
}
