import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { catalogService, type CatalogProduct } from "@/server/services/catalog.service";
import { CatalogProductCard } from "@/features/storefront/components/catalog-product-card";

export const metadata: Metadata = {
  title: "Commerce · Shop every store in one place",
  description: "Browse products from independent vendors — one cart, one checkout per store.",
  openGraph: {
    title: "Commerce",
    description: "Browse products from independent vendors.",
    type: "website",
  },
  alternates: { canonical: "/" },
};

// The catalogue is shared between visitors; per-visitor bits (badges, hearts)
// hydrate client-side, so this page can be cached and refreshed in the
// background rather than rebuilt per request.
export const revalidate = 60;

export default async function HomePage() {
  const [featured, bestSellers, categories, vendors] = await Promise.all([
    catalogService.featured(8),
    catalogService.bestSellers(4),
    catalogService.categories(),
    catalogService.vendors(6),
  ]);

  // Note: no wishlist lookup here. That would read cookies, forcing this page
  // dynamic and rebuilding the catalogue per visitor to colour some hearts.
  // `StorefrontProvider` hydrates them on the client instead.

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Commerce",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: "/products?search={search_term_string}" },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
            Every store, one place.
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Browse independent vendors, save what you love, and check out securely — card, wallet,
            or cash on delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Browse products
            </Link>
            <Link
              href="/categories"
              className="rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-white dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Shop by category
            </Link>
          </div>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby="home-categories">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="home-categories" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Categories
            </h2>
            <Link href="/categories" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              All categories
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="flex h-24 items-end rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-800 transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ProductRail
        id="home-featured"
        title="Featured"
        products={featured}
        emptyNote="No featured products yet."
      />

      {bestSellers.length > 0 && (
        <ProductRail id="home-best" title="Best sellers" products={bestSellers} />
      )}

      {vendors.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby="home-vendors">
          <h2 id="home-vendors" className="mb-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Stores
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/v/${v.slug}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 p-4 transition hover:border-indigo-400 dark:border-zinc-800"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    {v.logo ? (
                      <Image src={v.logo} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-sm font-semibold text-zinc-400">
                        {v.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {v.name}
                    </p>
                    {v.description && (
                      <p className="truncate text-xs text-zinc-500">{v.description}</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function ProductRail({
  id,
  title,
  products,
  emptyNote,
}: {
  id: string;
  title: string;
  products: CatalogProduct[];
  emptyNote?: string;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby={id}>
      <div className="mb-5 flex items-baseline justify-between">
        <h2 id={id} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        <Link href="/products" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          See all
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">{emptyNote ?? "Nothing here yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <CatalogProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </section>
  );
}
