"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
  const t = useTranslations("Checkout");
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
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-raised">
        {line.image ? (
          <Image src={line.image} alt={line.title} fill sizes="96px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
            {t("noImage")}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-foreground">
              {line.title}
            </h3>
            {line.sku && <p className="mt-0.5 text-xs text-text-tertiary">{t("sku", { sku: line.sku })}</p>}
            <p className="mt-1 text-sm text-text-secondary">
              {t("each", { price: formatMoney(line.unitPrice, currency) })}
            </p>
          </div>

          <p className="shrink-0 text-sm font-semibold text-foreground">
            {formatMoney(line.lineTotal, currency)}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-4 pt-3">
          <div className="inline-flex items-center rounded-lg border border-border-subtle">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending || line.quantity <= 1}
              aria-label={t("decreaseQty", { title: line.title })}
              className="px-3 py-1.5 text-sm text-text-secondary transition hover:text-foreground disabled:opacity-40"
            >
              −
            </button>
            <span
              aria-live="polite"
              className="min-w-10 border-x border-border-subtle px-3 py-1.5 text-center text-sm tabular-nums"
            >
              {line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending}
              aria-label={t("increaseQty", { title: line.title })}
              className="px-3 py-1.5 text-sm text-text-secondary transition hover:text-foreground disabled:opacity-40"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-sm text-text-tertiary underline-offset-4 transition hover:text-red-600 hover:underline disabled:opacity-40"
          >
            {t("remove")}
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
