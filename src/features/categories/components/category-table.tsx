"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { CategoryFormModal } from "./category-form-modal";
import { deleteCategoryAction } from "../actions";
import type { CategoryView } from "../queries";

/**
 * Category management table.
 *
 * A client component because it owns the add/edit/delete dialog state, same
 * shape as `CouponTable` — each row already carries the full category, so
 * editing opens straight from the row.
 */
export function CategoryTable({
  categories,
  vendorId,
}: {
  categories: CategoryView[];
  vendorId: string;
}) {
  const t = useTranslations("CategoryTable");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CategoryView | null>(null);
  const [deleting, setDeleting] = useState<CategoryView | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCategoryAction(vendorId, deleting.id);
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
        <p className="text-sm text-text-tertiary">{t("shown", { count: categories.length })}</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
        >
          {t("newCategory")}
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

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-tertiary">{t("noCategories")}</p>
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
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border-subtle bg-surface-raised text-left">
              <tr>
                <Th>{t("colName")}</Th>
                <Th>{t("colNameAr")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th className="text-right">{t("colActions")}</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border-subtle transition last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-text-secondary" dir="rtl">
                    {c.nameAr || "—"}
                  </td>
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

      {adding && <CategoryFormModal open onClose={() => setAdding(false)} vendorId={vendorId} />}

      {editing && (
        <CategoryFormModal open onClose={() => setEditing(null)} vendorId={vendorId} initial={editing} />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t("deleteCategory")}
        description={deleting?.name}
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-medium text-text-tertiary ${className ?? ""}`}>
      {children}
    </th>
  );
}
