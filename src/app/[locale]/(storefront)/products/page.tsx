import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import { catalogService, type CatalogSort } from "@/server/services/catalog.service";
import { CatalogProductCard } from "@/features/storefront/components/catalog-product-card";
import { Reveal } from "@/shared/components/reveal";
import { ProductFilters } from "@/features/storefront/components/product-filters";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";

type Search = Record<string, string | undefined>;

export const metadata: Metadata = {
  title: "Products · Bazaario",
  description: "Browse every product across the marketplace.",
  alternates: { canonical: "/products" },
};

// Shared catalogue: cacheable per filter combination.
export const revalidate = 60;

const SORTS = new Set<CatalogSort>(["newest", "price_asc", "price_desc", "rating", "popular"]);
const parseSort = (v: string | undefined): CatalogSort =>
  v && SORTS.has(v as CatalogSort) ? (v as CatalogSort) : "newest";

export default async function ProductsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await routeParams;
  setRequestLocale(locale);
  const t = await getTranslations("Products");
  const params = await searchParams;

  const [result, categories, brands, priceBounds] = await Promise.all([
    // `params` is passed wholesale on purpose: the service validates it against
    // storefrontFilterSchema and pins vendor/status, so nothing here can widen
    // the query beyond active products from active vendors.
    catalogService.listProducts({ ...params, limit: "24" }, { sort: parseSort(params.sort) }),
    catalogService.categories(),
    catalogService.brands(),
    catalogService.priceBounds(),
  ]);

  const search = params.search?.trim();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {search ? t("resultsFor", { search }) : t("title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t("count", { count: result.total })}</p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />}>
            <ProductFilters
              facets={{
                categories: categories.map((c) => ({
                  slug: c.slug,
                  name: localized(locale as Locale, c.name, c.nameAr),
                })),
                brands: brands.map((b) => ({ slug: b.slug, name: b.name })),
                priceBounds,
              }}
            />
          </Suspense>
          </div>
        </div>

        <div className="lg:col-span-3">
          {result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-16 text-center dark:border-zinc-800">
              <p className="text-sm text-zinc-500">{t("empty")}</p>
              <Link
                href="/products"
                className="mt-3 inline-block text-sm text-brand hover:underline dark:text-brand"
              >
                {t("clearFilters")}
              </Link>
            </div>
          ) : (
            <>
              {/* `key` on the filter state so a new result set replays the
                  reveal — otherwise filtered-in products appear with no motion
                  while the rest stay put, which reads as a rendering glitch. */}
              <Reveal
                key={`${result.page}:${JSON.stringify(params)}`}
                stagger
                className="grid grid-cols-2 gap-4 md:grid-cols-3"
              >
                {result.items.map((p) => (
                  <CatalogProductCard key={p.id} product={p} />
                ))}
              </Reveal>

              {result.totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-between border-t border-zinc-200 pt-6 dark:border-zinc-800" aria-label="Pagination">
                  <PageLink params={params} page={result.page - 1} disabled={!result.hasPrev}>
                    {t("prev")}
                  </PageLink>
                  <span className="text-sm text-zinc-500">
                    {t("pageOf", { page: result.page, totalPages: result.totalPages })}
                  </span>
                  <PageLink params={params} page={result.page + 1} disabled={!result.hasNext}>
                    {t("next")}
                  </PageLink>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Paging that preserves whatever filters are already in the URL. */
function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Search;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg px-3 py-2 text-sm text-zinc-300 dark:text-zinc-700">{children}</span>
    );
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") query.set(k, v);
  }
  query.set("page", String(page));

  return (
    <Link
      href={`/products?${query.toString()}`}
      className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}
