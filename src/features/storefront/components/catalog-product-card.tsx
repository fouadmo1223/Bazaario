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
 *
 * `featured` is purely a size/typography variant for use as the single larger
 * lead card in an otherwise-uniform grid (see the products listing page) — it
 * does not change any data or behavior.
 */
export function CatalogProductCard({
  product,
  currency = "USD",
  saved = false,
  featured = false,
}: {
  product: CatalogProduct;
  currency?: string;
  saved?: boolean;
  featured?: boolean;
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
      <div
        className={`group relative flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-border-default hover:shadow-sm ${
          featured ? "sm:flex-row" : ""
        }`}
      >
        <div
          className={`relative overflow-hidden bg-surface-raised ${
            featured ? "aspect-square sm:aspect-auto sm:w-1/2" : "aspect-square"
          }`}
        >
          {product.image ? (
            <Image
              src={product.image}
              alt={title}
              fill
              sizes={featured ? "(max-width: 640px) 100vw, 40vw" : "(max-width: 768px) 50vw, 25vw"}
              className="object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
              {t("noImageShort")}
            </div>
          )}

          {onSale && !soldOut && (
            <span className="absolute start-2 top-2 rounded-full bg-error px-2 py-0.5 text-xs font-semibold text-white shadow-xs">
              −{discount}%
            </span>
          )}
          {soldOut && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm font-semibold text-foreground">
              {t("soldOut")}
            </span>
          )}

          {/* Sits above the stretched link so it stays clickable. */}
          <div className="absolute end-2 top-2 z-10">
            <WishlistButton productId={product.id} initialSaved={saved} size="sm" />
          </div>

          <button
            type="button"
            onClick={() => setQuickView(true)}
            className="absolute inset-x-2 bottom-2 z-10 translate-y-1 rounded-btn bg-surface/95 py-2 text-xs font-semibold text-foreground opacity-0 shadow-sm transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
          >
            {t("quickView")}
          </button>
        </div>

        <div className={`flex flex-1 flex-col p-3.5 ${featured ? "sm:justify-center sm:p-6" : ""}`}>
          <h3 className={featured ? "text-lg font-medium text-foreground" : "line-clamp-2 text-sm font-medium text-foreground"}>
            {/* Stretched link: covers the card without wrapping the buttons. */}
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          </h3>

          {vendorName && <p className="mt-0.5 truncate text-xs text-text-tertiary">{vendorName}</p>}

          {product.ratingCount > 0 && (
            <p className="mt-1 text-xs text-text-tertiary">
              ★ {product.ratingAvg.toFixed(1)} ({product.ratingCount})
            </p>
          )}

          <div className={`flex items-baseline gap-1.5 ${featured ? "mt-3" : "mt-2"}`}>
            {spansRange && <span className="text-xs text-text-tertiary">{t("from")}</span>}
            <span className={`font-semibold tabular-nums text-foreground ${featured ? "text-xl" : "text-sm"}`}>
              {formatMoney(spansRange ? product.priceRange!.min : product.price, currency)}
            </span>
            {onSale && !spansRange && (
              <span className="text-xs text-text-tertiary line-through">
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
