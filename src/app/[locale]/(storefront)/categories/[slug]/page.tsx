import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { catalogService, type CatalogSort } from "@/server/services/catalog.service";
import { CatalogProductCard } from "@/features/storefront/components/catalog-product-card";
import { ProductFilters } from "@/features/storefront/components/product-filters";

type Params = { slug: string };
type Search = Record<string, string | undefined>;

export const revalidate = 60;

const SORTS = new Set<CatalogSort>(["newest", "price_asc", "price_desc", "rating", "popular"]);
const parseSort = (v: string | undefined): CatalogSort =>
  v && SORTS.has(v as CatalogSort) ? (v as CatalogSort) : "newest";

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const category = await catalogService.categoryBySlug(slug);
  if (!category) return { title: "Category not found" };

  return {
    title: `${category.name} · Bazaario`,
    description: `Browse ${category.name} across every store on the marketplace.`,
    alternates: { canonical: `/categories/${slug}` },
    openGraph: { title: category.name, type: "website" },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { slug } = await params;
  const query = await searchParams;

  const category = await catalogService.categoryBySlug(slug);
  if (!category) notFound();

  const [result, brands, priceBounds] = await Promise.all([
    // The route fixes the category; a `?category=` in the URL is overridden
    // rather than merged, so the page always shows what its path claims.
    catalogService.listProducts(
      { ...query, category: slug, limit: "24" },
      { sort: parseSort(query.sort) },
    ),
    catalogService.brands(),
    catalogService.priceBounds(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    url: `/categories/${slug}`,
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/categories" className="hover:text-indigo-600">
          Categories
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{category.name}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {category.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {result.total} {result.total === 1 ? "product" : "products"}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
            <ProductFilters
              hideCategory
              facets={{
                categories: [],
                brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
                priceBounds,
              }}
            />
          </Suspense>
        </div>

        <div className="lg:col-span-3">
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-500">Nothing in this category yet.</p>
              <Link
                href="/products"
                className="mt-3 inline-block text-sm text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Browse all products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {result.items.map((p) => (
                <CatalogProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
