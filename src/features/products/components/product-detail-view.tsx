"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Reveal } from "@/shared/components/reveal";
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
 *
 * The purchase block (title through add-to-cart) sits in its own `sticky`
 * wrapper, separate from description/FAQs below it, so it stays reachable
 * while a visitor scrolls a long description without following the whole
 * right column.
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
      <Reveal immediate fade={false} from="left">
        <ProductGallery media={product.media} title={product.title} activeUrl={activeImage} />
      </Reveal>

      <div>
        <Reveal immediate delay={0.1} className="lg:sticky lg:top-24 lg:self-start">
          <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-balance text-foreground sm:text-4xl">
            {product.title}
          </h1>

          {product.ratingCount > 0 && (
            <p className="mt-2 text-sm text-text-secondary">
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
                <span className="text-3xl font-semibold tabular-nums text-foreground">
                  {formatMoney(product.price, currency)}
                </span>
                {onSale && (
                  <span className="text-lg tabular-nums text-text-tertiary line-through">
                    {formatMoney(product.compareAtPrice!, currency)}
                  </span>
                )}
              </div>

              <p className="mt-2 text-sm">
                {product.inStock ? (
                  <span className="text-success">
                    {t("inStock")}
                    {product.stock > 0 && product.stock <= 5 ? t("onlyLeft", { count: product.stock }) : ""}
                  </span>
                ) : (
                  <span className="text-error">{t("outOfStock")}</span>
                )}
              </p>

              {product.sku && <p className="mt-4 text-xs text-text-tertiary">{t("sku", { sku: product.sku })}</p>}

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
            <p role="alert" className="mt-8 rounded-btn bg-warning/10 px-3 py-2 text-sm text-warning">
              {t("noOptions")}
            </p>
          )}

          {product.shortDescription && (
            <p className="mt-6 text-sm leading-relaxed text-text-secondary">{product.shortDescription}</p>
          )}
        </Reveal>

        {product.description && (
          <div className="mt-10 border-t border-border-subtle pt-6">
            <h2 className="text-sm font-semibold text-foreground">{t("description")}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-secondary">
              {product.description}
            </p>
          </div>
        )}

        {product.faqs.length > 0 && (
          <div className="mt-8 border-t border-border-subtle pt-6">
            <h2 className="text-sm font-semibold text-foreground">{t("faqs")}</h2>
            <dl className="mt-3 space-y-3">
              {product.faqs.map((f, i) => (
                <div key={i}>
                  <dt className="text-sm font-medium text-foreground">{f.question}</dt>
                  <dd className="text-sm text-text-secondary">{f.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
