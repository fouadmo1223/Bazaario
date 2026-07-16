import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { marketService } from "@/server/services/market.service";
import { productService } from "@/server/services/product.service";
import { isAppError } from "@/shared/lib/errors";

type Params = { market: string; slug: string };

export const revalidate = 60;

async function load(slug: string, productSlug: string) {
  const market = await marketService.getBySlug(slug);
  const product = await productService.getBySlug(String(market._id), productSlug);
  return { market, product };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { market: marketSlug, slug } = await params;
  try {
    const { product } = await load(marketSlug, slug);
    const description = product.seo?.description ?? product.shortDescription ?? product.description.slice(0, 155);
    return {
      title: product.seo?.title ?? `${product.title} · Commerce`,
      description,
      openGraph: {
        title: product.title,
        description,
        images: product.media[0]?.url ? [product.media[0].url] : undefined,
        type: "website",
      },
      twitter: { card: "summary_large_image", title: product.title, description },
      alternates: { canonical: `/m/${marketSlug}/p/${slug}` },
    };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { market: marketSlug, slug } = await params;

  let data;
  try {
    data = await load(marketSlug, slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { market, product } = data;
  if (product.status !== "active") notFound();

  const currency = market.settings.currency;
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  const onSale = product.compareAtPrice != null && product.compareAtPrice > product.price;
  const inStock = !product.trackInventory || product.stock > 0 || product.allowBackorder;

  // Product structured data → rich results (price, availability, rating).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.media.map((m) => m.url),
    sku: product.sku ?? undefined,
    offers: {
      "@type": "Offer",
      price: product.price,
      priceCurrency: currency,
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `/m/${marketSlug}/p/${slug}`,
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          },
        }
      : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: market.name, item: `/m/${marketSlug}` },
      { "@type": "ListItem", position: 2, name: product.title, item: `/m/${marketSlug}/p/${slug}` },
    ],
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <nav className="mb-6 text-sm text-zinc-500">
          <Link href={`/m/${marketSlug}`} className="hover:text-indigo-600">
            {market.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{product.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
            {product.media[0]?.url ? (
              <Image
                src={product.media[0].url}
                alt={product.media[0].alt ?? product.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-zinc-400">No image</div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {product.title}
            </h1>

            {product.ratingCount > 0 && (
              <p className="mt-2 text-sm text-zinc-500">
                ★ {product.ratingAvg.toFixed(1)} · {product.ratingCount} reviews
              </p>
            )}

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
                {money(product.price)}
              </span>
              {onSale && (
                <span className="text-lg text-zinc-400 line-through">{money(product.compareAtPrice!)}</span>
              )}
            </div>

            <p className="mt-2 text-sm">
              {inStock ? (
                <span className="text-emerald-600 dark:text-emerald-400">In stock</span>
              ) : (
                <span className="text-red-600 dark:text-red-400">Out of stock</span>
              )}
            </p>

            {product.shortDescription && (
              <p className="mt-6 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {product.shortDescription}
              </p>
            )}

            <button
              disabled={!inStock}
              className="mt-8 w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inStock ? "Add to cart" : "Sold out"}
            </button>

            {product.description && (
              <div className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Description</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {product.description}
                </p>
              </div>
            )}

            {product.faqs.length > 0 && (
              <div className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">FAQs</h2>
                <dl className="mt-3 space-y-3">
                  {product.faqs.map((f, i) => (
                    <div key={i}>
                      <dt className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{f.question}</dt>
                      <dd className="text-sm text-zinc-600 dark:text-zinc-400">{f.answer}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
