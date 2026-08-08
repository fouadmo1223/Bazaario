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
        <p className="text-sm text-text-tertiary">{t("shown", { count: coupons.length })}</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
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
        <div className="rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-tertiary">{t("noCoupons")}</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
          >
            {t("createFirst")}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border-subtle bg-surface-raised text-left">
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
                  className="border-b border-border-subtle transition last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3">
                    <p className="font-mono font-medium text-foreground">{c.code}</p>
                    <p className="text-xs text-text-tertiary">{scopeLabel(c, t)}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {discountLabel(c, currency, t)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-tertiary">{limitLabel(c, t)}</td>
                  <td className="px-4 py-3 text-xs text-text-tertiary">{windowLabel(c, t)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-surface-raised text-text-secondary"
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
                        className="text-xs font-medium text-brand hover:underline dark:text-brand"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(c)}
                        className="text-xs text-text-tertiary hover:text-red-600 hover:underline"
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
        <p className="text-sm text-text-secondary">{t("deleteConfirm")}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            disabled={pending}
            className="text-sm text-text-tertiary hover:underline disabled:opacity-50"
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
    <th scope="col" className={`px-4 py-2.5 font-medium text-text-tertiary ${className ?? ""}`}>
      {children}
    </th>
  );
}
