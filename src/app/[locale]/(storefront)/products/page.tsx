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
    <div className="mx-auto max-w-6xl px-6 py-10 md:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {search ? t("resultsFor", { search }) : t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t("count", { count: result.total })}</p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <div className="rounded-card border border-border-subtle p-5">
          <Suspense fallback={<div className="h-64 animate-pulse rounded-card bg-surface-raised" />}>
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
            <div className="rounded-card border border-dashed border-border-default p-16 text-center">
              <p className="text-sm text-text-secondary">{t("empty")}</p>
              <Link href="/products" className="mt-3 inline-block text-sm text-brand hover:underline">
                {t("clearFilters")}
              </Link>
            </div>
          ) : (
            <>
              {/* `key` on the filter state so a new result set replays the
                  reveal — otherwise filtered-in products appear with no motion
                  while the rest stay put, which reads as a rendering glitch.
                  The first item on an unfiltered first page spans two columns
                  as a lead card — variety instead of a uniform grid. */}
              <Reveal
                key={`${result.page}:${JSON.stringify(params)}`}
                stagger
                className="grid grid-cols-2 gap-4 md:grid-cols-3"
              >
                {result.items.map((p, i) => {
                  const isLead = result.page === 1 && i === 0 && result.items.length > 4;
                  return (
                    <div key={p.id} className={isLead ? "col-span-2" : undefined}>
                      <CatalogProductCard product={p} featured={isLead} />
                    </div>
                  );
                })}
              </Reveal>

              {result.totalPages > 1 && (
                <nav className="mt-10 flex items-center justify-between border-t border-border-subtle pt-6" aria-label="Pagination">
                  <PageLink params={params} page={result.page - 1} disabled={!result.hasPrev}>
                    {t("prev")}
                  </PageLink>
                  <span className="text-sm text-text-secondary">
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
    return <span className="rounded-btn px-3 py-2 text-sm text-text-tertiary">{children}</span>;
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") query.set(k, v);
  }
  query.set("page", String(page));

  return (
    <Link
      href={`/products?${query.toString()}`}
      className="rounded-btn px-3 py-2 text-sm font-medium text-foreground transition hover:bg-surface-raised"
    >
      {children}
    </Link>
  );
}
