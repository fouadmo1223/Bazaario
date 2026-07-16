"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItemAction, removeCartItemAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";
import type { CartLineView } from "../queries";

/**
 * One cart line: quantity stepper plus removal.
 *
 * Quantity is not optimistic. A step can legitimately fail server-side (stock
 * ran out between render and click), and showing a number that then springs
 * back is worse than a brief pending state on something this consequential.
 */
export function CartLineItem({
  line,
  vendorId,
  vendorSlug,
  currency,
}: {
  line: CartLineView;
  vendorId: string;
  vendorSlug: string;
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ref = { productId: line.productId, variantId: line.variantId ?? undefined };

  function setQuantity(quantity: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateCartItemAction(vendorId, vendorSlug, { ...ref, quantity });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCartItemAction(vendorId, vendorSlug, ref);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li
      className="flex gap-4 py-5"
      aria-busy={pending}
      data-pending={pending ? "" : undefined}
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
        {line.image ? (
          <Image src={line.image} alt={line.title} fill sizes="96px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            No image
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {line.title}
            </h3>
            {line.sku && <p className="mt-0.5 text-xs text-zinc-500">SKU: {line.sku}</p>}
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {formatMoney(line.unitPrice, currency)} each
            </p>
          </div>

          <p className="shrink-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {formatMoney(line.lineTotal, currency)}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-4 pt-3">
          <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending || line.quantity <= 1}
              aria-label={`Decrease quantity of ${line.title}`}
              className="px-3 py-1.5 text-sm text-zinc-600 transition hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="min-w-10 border-x border-zinc-200 px-3 py-1.5 text-center text-sm tabular-nums dark:border-zinc-800"
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending}
              aria-label={`Increase quantity of ${line.title}`}
              className="px-3 py-1.5 text-sm text-zinc-600 transition hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-sm text-zinc-500 underline-offset-4 transition hover:text-red-600 hover:underline disabled:opacity-40"
          >
            Remove
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
