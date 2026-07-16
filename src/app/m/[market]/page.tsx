import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marketService } from "@/server/services/market.service";
import { productService } from "@/server/services/product.service";
import { ProductCard, type ProductCardData } from "@/features/storefront/components/product-card";
import { isAppError } from "@/shared/lib/errors";

type Params = { market: string };
type Search = { page?: string; search?: string; sort?: string };

// Storefront listings are ISR-cached; mutations revalidate via Redis + tags.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { market: slug } = await params;
  try {
    const market = await marketService.getBySlug(slug);
    return {
      title: `${market.name} · Commerce`,
      description: market.description ?? `Shop ${market.name}`,
      openGraph: {
        title: market.name,
        description: market.description ?? undefined,
        images: market.banner ? [market.banner] : undefined,
        type: "website",
      },
      twitter: { card: "summary_large_image", title: market.name },
      alternates: { canonical: `/m/${slug}` },
    };
  } catch {
    return { title: "Market not found" };
  }
}

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { market: slug } = await params;
  const { page = "1", search } = await searchParams;

  let market;
  try {
    market = await marketService.getBySlug(slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const result = await productService.listStorefront(String(market._id), {
    page,
    limit: 12,
    ...(search ? { search } : {}),
  });

  const products: ProductCardData[] = result.items.map((p) => ({
    id: String(p._id),
    slug: p.slug,
    title: p.title,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    image: p.media[0]?.url ?? null,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    stock: p.stock,
  }));

  // Organization + breadcrumb structured data for search engines.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: market.name,
    description: market.description ?? undefined,
    image: market.logo ?? undefined,
  };

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {market.name}
          </h1>
          {market.description && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{market.description}</p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-4 text-sm text-zinc-500">
          {result.total} {result.total === 1 ? "product" : "products"}
          {search ? ` for “${search}”` : ""}
        </p>

        {products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-500">No products found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                marketSlug={slug}
                currency={market.settings.currency}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
