"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { WishlistButton } from "@/features/wishlist/components/wishlist-button";
import { QuickViewModal } from "./quick-view-modal";
import { formatMoney, discountPercent } from "@/shared/lib/format";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";
import type { CatalogProduct } from "@/server/services/catalog.service";

/**
 * Marketplace product card.
 *
 * The card links to the product page, but the heart and quick-view are buttons
 * *beside* that link rather than inside it — nesting interactive controls in an
 * anchor is invalid HTML and makes them unreachable by keyboard. The link covers
 * the media and title via a stretched overlay instead.
 */
export function CatalogProductCard({
  product,
  currency = "USD",
  saved = false,
}: {
  product: CatalogProduct;
  currency?: string;
  saved?: boolean;
}) {
  const t = useTranslations("ProductDetail");
  const locale = useLocale() as Locale;
  const [quickView, setQuickView] = useState(false);
  const title = localized(locale, product.title, product.titleAr);
  const vendorName = localized(locale, product.vendorName, product.vendorNameAr);

  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const discount = onSale ? discountPercent(product.price, product.compareAtPrice!) : 0;
  // A variable product's `stock` is the parent's and means nothing — its real
  // availability lives on the variants, so don't stamp it "sold out" from here.
  const soldOut = !product.isVariable && product.stock <= 0;
  const href = `/v/${product.vendorSlug}/p/${product.slug}`;

  // "From X" when variants span a range; a single figure would misprice the rest.
  const spansRange =
    product.priceRange != null && product.priceRange.max > product.priceRange.min;

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950">
        <div className="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {product.image ? (
            <Image
              src={product.image}
              alt={title}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-400">
              {t("noImageShort")}
            </div>
          )}

          {onSale && !soldOut && (
            <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
              −{discount}%
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-zinc-700 dark:bg-black/60 dark:text-zinc-200">
              {t("soldOut")}
            </span>
          )}

          {/* Sits above the stretched link so it stays clickable. */}
          <div className="absolute right-2 top-2 z-10">
            <WishlistButton productId={product.id} initialSaved={saved} size="sm" />
          </div>

          <button
            type="button"
            onClick={() => setQuickView(true)}
            className="absolute inset-x-2 bottom-2 z-10 rounded-lg bg-white/95 py-2 text-xs font-semibold text-zinc-900 opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100 dark:bg-zinc-900/95 dark:text-zinc-100"
          >
            {t("quickView")}
          </button>
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {/* Stretched link: covers the card without wrapping the buttons. */}
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          </h3>

          {vendorName && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{vendorName}</p>
          )}

          {product.ratingCount > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount})
            </p>
          )}

          <div className="mt-2 flex items-baseline gap-2">
            {spansRange && (
              <span className="text-xs text-zinc-500">from</span>
            )}
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              {formatMoney(spansRange ? product.priceRange!.min : product.price, currency)}
            </span>
            {onSale && !spansRange && (
              <span className="text-xs text-zinc-400 line-through">
                {formatMoney(product.compareAtPrice!, currency)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mounted only while open so a grid of 24 cards isn't 24 dialogs. */}
      {quickView && (
        <QuickViewModal
          product={product}
          currency={currency}
          saved={saved}
          open={quickView}
          onClose={() => setQuickView(false)}
        />
      )}
    </>
  );
}
