"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProductGallery, type GalleryMedia } from "./product-gallery";
import { VariantPicker, type VariantOption, type VariantView } from "./variant-picker";
import { AddToCartButton } from "@/features/cart/components/add-to-cart-button";
import { WishlistButton } from "@/features/wishlist/components/wishlist-button";
import { formatMoney } from "@/shared/lib/format";

export type ProductDetailData = {
  id: string;
  title: string;
  description: string;
  shortDescription: string | null;
  type: "simple" | "variable";
  price: number;
  compareAtPrice: number | null;
  stock: number;
  sku: string | null;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
  media: GalleryMedia[];
  attributes: VariantOption[];
  variants: VariantView[];
  faqs: { question: string; answer: string }[];
};

/**
 * Product detail body.
 *
 * A client component because the gallery and the variant picker share state:
 * choosing "Red" should swap the main image. Everything it needs is passed in
 * already serialized — no Mongoose documents cross the boundary.
 */
export function ProductDetailView({
  product,
  vendorId,
  vendorSlug,
  currency,
}: {
  product: ProductDetailData;
  vendorId: string;
  vendorSlug: string;
  currency: string;
}) {
  const t = useTranslations("ProductDetail");
  const [activeImage, setActiveImage] = useState<string | null>(null);

  const isVariable = product.type === "variable" && product.variants.length > 0;
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <ProductGallery media={product.media} title={product.title} activeUrl={activeImage} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {product.title}
        </h1>

        {product.ratingCount > 0 && (
          <p className="mt-2 text-sm text-zinc-500">
            ★ {product.ratingAvg.toFixed(1)} · {t("reviews", { count: product.ratingCount })}
          </p>
        )}

        {isVariable ? (
          <VariantPicker
            vendorId={vendorId}
            vendorSlug={vendorSlug}
            productId={product.id}
            attributes={product.attributes}
            variants={product.variants}
            currency={currency}
            onImageChange={setActiveImage}
          />
        ) : (
          <>
            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {formatMoney(product.price, currency)}
              </span>
              {onSale && (
                <span className="text-lg text-zinc-400 line-through">
                  {formatMoney(product.compareAtPrice!, currency)}
                </span>
              )}
            </div>

            <p className="mt-2 text-sm">
              {product.inStock ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  {t("inStock")}
                  {product.stock > 0 && product.stock <= 5 ? t("onlyLeft", { count: product.stock }) : ""}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">{t("outOfStock")}</span>
              )}
            </p>

            {product.sku && <p className="mt-4 text-xs text-zinc-500">{t("sku", { sku: product.sku })}</p>}

            <div className="mt-8 flex items-center gap-3">
              <AddToCartButton
                className="flex-1"
                vendorId={vendorId}
                vendorSlug={vendorSlug}
                productId={product.id}
                disabled={!product.inStock}
              />
              <WishlistButton productId={product.id} />
            </div>
          </>
        )}

        {/* A variable product with no variants configured cannot be bought;
            say so rather than showing a button that always fails. */}
        {product.type === "variable" && product.variants.length === 0 && (
          <p
            role="alert"
            className="mt-8 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
          >
            {t("noOptions")}
          </p>
        )}

        {product.shortDescription && (
          <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {product.shortDescription}
          </p>
        )}

        {product.description && (
          <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {product.description}
            </p>
          </div>
        )}

        {product.faqs.length > 0 && (
          <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("faqs")}</h2>
            <dl className="mt-3 space-y-3">
              {product.faqs.map((f, i) => (
                <div key={i}>
                  <dt className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {f.question}
                  </dt>
                  <dd className="text-sm text-zinc-600 dark:text-zinc-400">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
