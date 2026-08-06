"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { moveToCartAction, removeFromWishlistAction } from "../actions";
import { formatMoney } from "@/shared/lib/format";
import type { WishlistItemView } from "../queries";

/** One saved item: move to cart, or drop it. */
export function WishlistItem({ item }: { item: WishlistItemView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inStock = item.stock > 0;
  const canBuy = item.available && inStock;

  function moveToCart() {
    setError(null);
    startTransition(async () => {
      const result = await moveToCartAction({
        productId: item.productId,
        vendorId: item.vendorId,
        vendorSlug: item.vendorSlug,
      });
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
      const result = await removeFromWishlistAction({ productId: item.productId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex gap-4 py-5" aria-busy={pending}>
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
        {item.image ? (
          <Image src={item.image} alt="" fill sizes="96px" className="object-cover" />
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
              <Link href={`/v/${item.vendorSlug}/p/${item.slug}`} className="hover:text-indigo-600">
                {item.title}
              </Link>
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">{item.vendorName}</p>

            <p className="mt-1 text-xs">
              {!item.available ? (
                <span className="text-zinc-500">No longer available</span>
              ) : inStock ? (
                <span className="text-emerald-600 dark:text-emerald-400">In stock</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">Out of stock</span>
              )}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {formatMoney(item.price, item.currency)}
            </p>
            {item.compareAtPrice != null && item.compareAtPrice > item.price && (
              <p className="text-xs text-zinc-400 line-through">
                {formatMoney(item.compareAtPrice, item.currency)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto flex items-center gap-4 pt-3">
          <button
            type="button"
            onClick={moveToCart}
            disabled={pending || !canBuy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Working…" : "Move to cart"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-xs text-zinc-500 underline-offset-4 transition hover:text-red-600 hover:underline disabled:opacity-40"
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
