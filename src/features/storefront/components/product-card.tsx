import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { formatMoney, discountPercent } from "@/shared/lib/format";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  titleAr?: string | null;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  stock?: number;
};

export async function ProductCard({
  product,
  vendorSlug,
  currency = "USD",
}: {
  product: ProductCardData;
  vendorSlug: string;
  currency?: string;
}) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("ProductDetail");
  const title = localized(locale, product.title, product.titleAr);
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const discount = onSale ? discountPercent(product.price, product.compareAtPrice!) : 0;
  const soldOut = product.stock != null && product.stock <= 0;

  return (
    <Link
      href={`/v/${vendorSlug}/p/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-border-subtle bg-surface transition hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-raised">
        {product.image ? (
          <Image
            src={product.image}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-text-tertiary">
            {t("noImageShort")}
          </div>
        )}

        {onSale && !soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            −{discount}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/70 text-sm font-semibold text-text-secondary/60">
            {t("soldOut")}
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">
          {title}
        </h3>
        {product.ratingCount ? (
          <p className="mt-1 text-xs text-text-tertiary">
            ★ {product.ratingAvg?.toFixed(1)} ({product.ratingCount})
          </p>
        ) : null}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-semibold text-foreground">
            {formatMoney(product.price, currency)}
          </span>
          {onSale && (
            <span className="text-xs text-text-tertiary line-through">
              {formatMoney(product.compareAtPrice!, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
