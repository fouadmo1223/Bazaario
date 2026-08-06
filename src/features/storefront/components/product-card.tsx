import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { formatMoney, discountPercent } from "@/shared/lib/format";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  stock?: number;
};

export function ProductCard({
  product,
  vendorSlug,
  currency = "USD",
}: {
  product: ProductCardData;
  vendorSlug: string;
  currency?: string;
}) {
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const discount = onSale ? discountPercent(product.price, product.compareAtPrice!) : 0;
  const soldOut = product.stock != null && product.stock <= 0;

  return (
    <Link
      href={`/v/${vendorSlug}/p/${product.slug}`}
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
        )}

        {onSale && !soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
            −{discount}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-zinc-700 dark:bg-black/60 dark:text-zinc-200">
            Sold out
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {product.title}
        </h3>
        {product.ratingCount ? (
          <p className="mt-1 text-xs text-zinc-500">
            ★ {product.ratingAvg?.toFixed(1)} ({product.ratingCount})
          </p>
        ) : null}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">
            {formatMoney(product.price, currency)}
          </span>
          {onSale && (
            <span className="text-xs text-zinc-400 line-through">
              {formatMoney(product.compareAtPrice!, currency)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
