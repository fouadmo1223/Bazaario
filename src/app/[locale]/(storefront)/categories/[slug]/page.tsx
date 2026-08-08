import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { catalogService, type CatalogSort } from "@/server/services/catalog.service";
import { CatalogProductCard } from "@/features/storefront/components/catalog-product-card";
import { ProductFilters } from "@/features/storefront/components/product-filters";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { localized } from "@/shared/lib/localized";
import { Breadcrumbs } from "@/shared/ui/breadcrumbs";
import type { Locale } from "@/i18n/locales";

type Params = { locale: string; slug: string };
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
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Categories");
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

  const categoryName = localized(locale as Locale, category.name, category.nameAr);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    url: `/categories/${slug}`,
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 md:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Breadcrumbs
        className="mb-6"
        items={[{ label: t("title"), href: "/categories" }, { label: categoryName }]}
      />

      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{categoryName}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t("productCount", { count: result.total })}</p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-raised" />}>
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
            <div className="rounded-card border border-dashed border-border-default p-16 text-center">
              <p className="text-sm text-text-secondary">{t("emptyCategory")}</p>
              <Link href="/products" className="mt-3 inline-block text-sm text-brand hover:underline">
                {t("browseAll")}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {result.items.map((p, i) => {
                const isLead = i === 0 && result.items.length > 4;
                return (
                  <div key={p.id} className={isLead ? "col-span-2" : undefined}>
                    <CatalogProductCard product={p} featured={isLead} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
