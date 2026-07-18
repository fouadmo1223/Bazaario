"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/shared/components/modal";
import { AddToCartButton } from "@/features/cart/components/add-to-cart-button";
import { WishlistButton } from "@/features/wishlist/components/wishlist-button";
import { formatMoney, discountPercent } from "@/shared/lib/format";
import type { CatalogProduct } from "@/server/services/catalog.service";

/**
 * Quick view: enough to decide and add to cart without leaving the grid.
 *
 * Deliberately not a substitute for the product page — it shows price, stock and
 * a buy action, and links out for the full description, specs and reviews.
 */
export function QuickViewModal({
  product,
  currency,
  saved = false,
  open,
  onClose,
}: {
  product: CatalogProduct;
  currency: string;
  saved?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const discount = onSale ? discountPercent(product.price, product.compareAtPrice!) : 0;
  // Variable products carry their availability on the variants, not the parent.
  const inStock = product.isVariable || product.stock > 0;
  const href = `/v/${product.vendorSlug}/p/${product.slug}`;
  const spansRange =
    product.priceRange != null && product.priceRange.max > product.priceRange.min;

  return (
    <Modal open={open} onClose={onClose} title={product.title} description={product.vendorName} size="lg">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.title}
              fill
              sizes="(max-width: 640px) 90vw, 320px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              No image
            </div>
          )}
          {onSale && inStock && (
            <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
              −{discount}%
            </span>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            {spansRange ? (
              <span className="text-2xl font-semibold">
                {formatMoney(product.priceRange!.min, currency)} –{" "}
                {formatMoney(product.priceRange!.max, currency)}
              </span>
            ) : (
              <span className="text-2xl font-semibold">{formatMoney(product.price, currency)}</span>
            )}
            {onSale && !spansRange && (
              <span className="text-sm text-zinc-400 line-through">
                {formatMoney(product.compareAtPrice!, currency)}
              </span>
            )}
          </div>

          {product.ratingCount > 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              ★ {product.ratingAvg.toFixed(1)} · {product.ratingCount} reviews
            </p>
          )}

          <p className="mt-3 text-sm">
            {!inStock ? (
              <span className="text-red-600 dark:text-red-400">Out of stock</span>
            ) : product.isVariable ? (
              // A variable parent's `stock` is 0 by design — real availability
              // lives on the variants, which this summary does not load. Quoting
              // it here produced "In stock — only 0 left".
              <span className="text-emerald-600 dark:text-emerald-400">
                Available in {product.priceRange ? "several options" : "options"}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400">
                In stock{product.stock <= 5 ? ` — only ${product.stock} left` : ""}
              </span>
            )}
          </p>

          <div className="mt-6 space-y-3 sm:mt-auto sm:pt-6">
            <div className="flex items-center gap-2">
              {product.isVariable ? (
                // Variable products need a chosen variant, and the picker needs
                // the product's attributes — more than this summary carries. Send
                // the shopper to the page that can actually complete the sale
                // rather than an "Add" the server would reject.
                <Link
                  href={href}
                  onClick={onClose}
                  className="flex-1 rounded-lg bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Choose options
                </Link>
              ) : (
                <AddToCartButton
                  className="flex-1"
                  vendorId={product.vendorId}
                  vendorSlug={product.vendorSlug}
                  productId={product.id}
                  disabled={!inStock}
                />
              )}
              <WishlistButton productId={product.id} initialSaved={saved} />
            </div>

            <Link
              href={href}
              onClick={onClose}
              className="block text-center text-sm text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
            >
              View full details
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Convenience wrapper owning the open/close state for a single card. */
export function useQuickView() {
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  return {
    product,
    open: product !== null,
    show: (p: CatalogProduct) => setProduct(p),
    close: () => setProduct(null),
  };
}
