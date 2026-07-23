"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
        <p className="text-sm text-zinc-500">{coupons.length} shown</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          New coupon
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
          <p className="text-sm text-zinc-500">No coupons yet.</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Create your first coupon
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Limits</Th>
                <Th>Window</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
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
                    <p className="text-xs text-zinc-500">{scopeLabel(c)}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {discountLabel(c, currency)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{limitLabel(c)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{windowLabel(c)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.isActive
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {c.isActive ? "Active" : "Off"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(c)}
                        className="text-xs text-zinc-500 hover:text-red-600 hover:underline"
                      >
                        Delete
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
        title="Delete coupon"
        description={deleting?.code}
        size="sm"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Shoppers can no longer redeem this code. Past orders that used it keep their own record,
          so their history is unaffected.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setDeleting(null)}
            disabled={pending}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Modal>
    </>
  );
}

function discountLabel(c: CouponView, currency: string): string {
  if (c.type === "free_shipping") return "Free shipping";
  if (c.type === "percentage") {
    return `${c.value}% off${c.maxDiscount != null ? ` (max ${formatMoney(c.maxDiscount, currency)})` : ""}`;
  }
  return `${formatMoney(c.value, currency)} off`;
}

function scopeLabel(c: CouponView): string {
  const parts: string[] = [];
  if (c.appliesToProducts.length) parts.push(`${c.appliesToProducts.length} product${c.appliesToProducts.length === 1 ? "" : "s"}`);
  if (c.appliesToCategories.length) parts.push(`${c.appliesToCategories.length} categor${c.appliesToCategories.length === 1 ? "y" : "ies"}`);
  return parts.length ? `Limited to ${parts.join(" + ")}` : "Whole cart";
}

function limitLabel(c: CouponView): string {
  const parts: string[] = [];
  if (c.usageLimit != null) parts.push(`${c.usedCount}/${c.usageLimit} used`);
  else if (c.usedCount > 0) parts.push(`${c.usedCount} used`);
  if (c.perUserLimit != null) parts.push(`${c.perUserLimit}/shopper`);
  return parts.length ? parts.join(" · ") : "No limit";
}

function windowLabel(c: CouponView): string {
  if (!c.startsAt && !c.expiresAt) return "Always";
  return `${c.startsAt ?? "—"} → ${c.expiresAt ?? "—"}`;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-medium text-zinc-500 ${className ?? ""}`}>
      {children}
    </th>
  );
}
