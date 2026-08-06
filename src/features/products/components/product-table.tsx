"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/shared/components/modal";
import { ProductFormModal } from "./product-form-modal";
import { VariantMatrixModal } from "./variant-matrix-modal";
import { deleteProductAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";
import type { Option, ProductRow, ProductFormValues, VariantEditorData } from "../queries";

const STATUS_STYLE: Record<ProductRow["status"], string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  archived: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

/**
 * Product management table.
 *
 * A client component because it owns the add/edit/delete dialog state. The rows
 * themselves are rendered from data the server already resolved.
 */
export function ProductTable({
  products,
  vendorId,
  vendorSlug,
  currency,
  categories,
  brands,
}: {
  products: ProductRow[];
  vendorId: string;
  vendorSlug: string;
  currency: string;
  categories: Option[];
  brands: Option[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProductFormValues | null>(null);
  const [variants, setVariants] = useState<VariantEditorData | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  const [loadingVariants, setLoadingVariants] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /**
   * The table row carries only what the table shows. Fetch the full record
   * before opening the editor, rather than shipping every field for every row
   * on the chance one gets edited.
   */
  async function openEdit(row: ProductRow) {
    setError(null);
    setLoadingEdit(row.id);
    try {
      const res = await fetch(`/api/dashboard/products/${row.id}`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; data?: ProductFormValues; error?: { message: string } };
      if (!body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load that product.");
        return;
      }
      setEditing(body.data);
    } catch {
      setError("Could not load that product.");
    } finally {
      setLoadingEdit(null);
    }
  }

  /** Load the option definitions and variant grid, then open the matrix editor. */
  async function openVariants(row: ProductRow) {
    setError(null);
    setLoadingVariants(row.id);
    try {
      const res = await fetch(`/api/dashboard/products/${row.id}/variants`, { cache: "no-store" });
      const body = (await res.json()) as { ok: boolean; data?: VariantEditorData; error?: { message: string } };
      if (!body.ok || !body.data) {
        setError(body.error?.message ?? "Could not load variants.");
        return;
      }
      setVariants(body.data);
    } catch {
      setError("Could not load variants.");
    } finally {
      setLoadingVariants(null);
    }
  }

  function confirmDelete() {
    if (!deleting) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProductAction(vendorId, deleting.id);
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
        <p className="text-sm text-zinc-500">
          {products.length} shown
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          New product
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

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">No products yet.</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Add your first product
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <Th>Product</Th>
                <Th>Status</Th>
                <Th>Price</Th>
                <Th>Stock</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                        {p.image ? (
                          <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {p.title}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {p.type === "variable"
                            ? `${p.variantCount} variant${p.variantCount === 1 ? "" : "s"}`
                            : (p.sku ?? "No SKU")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status]}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                    {p.type === "variable" ? (
                      <span className="text-zinc-500">from {formatMoney(p.price, currency)}</span>
                    ) : (
                      formatMoney(p.price, currency)
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={p.stock <= 5 ? "text-amber-600 dark:text-amber-400" : "text-zinc-700 dark:text-zinc-300"}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {p.status === "active" && (
                        <Link
                          href={`/v/${vendorSlug}/p/${p.slug}`}
                          className="text-xs text-zinc-500 hover:text-indigo-600 hover:underline"
                        >
                          View
                        </Link>
                      )}
                      {p.type === "variable" && (
                        <button
                          type="button"
                          onClick={() => openVariants(p)}
                          disabled={loadingVariants === p.id}
                          className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                        >
                          {loadingVariants === p.id ? "Loading…" : "Variants"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        disabled={loadingEdit === p.id}
                        className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                      >
                        {loadingEdit === p.id ? "Loading…" : "Edit"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(p)}
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
        <ProductFormModal
          open
          onClose={() => setAdding(false)}
          vendorId={vendorId}
          categories={categories}
          brands={brands}
        />
      )}

      {editing && (
        <ProductFormModal
          open
          onClose={() => setEditing(null)}
          vendorId={vendorId}
          categories={categories}
          brands={brands}
          initial={editing}
        />
      )}

      {variants && (
        <VariantMatrixModal
          open
          onClose={() => setVariants(null)}
          vendorId={vendorId}
          data={variants}
        />
      )}

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete product"
        description={deleting?.title}
        size="sm"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This removes the product from your catalogue. Existing orders keep their own copy of the
          item, so their history is unaffected.
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

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-medium text-zinc-500 ${className ?? ""}`}>
      {children}
    </th>
  );
}
