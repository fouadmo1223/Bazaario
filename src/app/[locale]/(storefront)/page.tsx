import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { catalogService, type CatalogProduct } from "@/server/services/catalog.service";
import { CatalogProductCard } from "@/features/storefront/components/catalog-product-card";
import { Reveal } from "@/shared/components/reveal";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";

export const metadata: Metadata = {
  title: "Bazaario · Shop every store in one place",
  description: "Browse products from independent vendors — one cart, one checkout per store.",
  openGraph: {
    title: "Bazaario",
    description: "Browse products from independent vendors.",
    type: "website",
  },
  alternates: { canonical: "/" },
};

// The catalogue is shared between visitors; per-visitor bits (badges, hearts)
// hydrate client-side, so this page can be cached and refreshed in the
// background rather than rebuilt per request.
export const revalidate = 60;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const [featured, newArrivals, onSale, bestSellers, categories, vendors] = await Promise.all([
    catalogService.featured(8),
    catalogService.newArrivals(8),
    catalogService.onSale(4),
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
    name: "Bazaario",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: "/products?search={search_term_string}" },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800">
        {/* A single soft glow anchored top-start, not a scattered blob field —
            it reads as one deliberate light source instead of decoration. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 start-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand/10 blur-3xl dark:bg-brand/15"
        />
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-28">
          {/* Slide only, no fade: this heading is the LCP candidate. */}
          <Reveal immediate fade={false}>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-zinc-900 dark:text-zinc-50 sm:text-6xl">
              {t("heroTitle")}
            </h1>
          </Reveal>

          <Reveal immediate delay={0.1}>
            <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              {t("heroSubtitle")}
            </p>
          </Reveal>

          <Reveal immediate delay={0.2} className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-md"
            >
              {t("browseProducts")}
            </Link>
            <Link
              href="/categories"
              className="rounded-xl border border-zinc-300 bg-white/60 px-5 py-3 text-sm font-medium text-zinc-700 backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {t("shopByCategory")}
            </Link>
          </Reveal>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby="home-categories">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="home-categories" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {t("categories")}
            </h2>
            <Link href="/categories" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              {t("allCategories")}
            </Link>
          </div>
          <Reveal as="ul" stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="flex h-24 items-end rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm font-medium text-zinc-800 transition hover:border-indigo-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                >
                  {localized(locale as Locale, c.name, c.nameAr)}
                </Link>
              </li>
            ))}
          </Reveal>
        </section>
      )}

      <ProductRail
        id="home-featured"
        title={t("featured")}
        seeAllLabel={t("seeAll")}
        products={featured}
        emptyNote={t("noFeatured")}
      />

      {onSale.length > 0 && (
        <ProductRail id="home-deals" title={t("deals")} seeAllLabel={t("seeAll")} products={onSale} />
      )}

      {newArrivals.length > 0 && (
        <ProductRail id="home-new" title={t("newArrivals")} seeAllLabel={t("seeAll")} products={newArrivals} />
      )}

      {bestSellers.length > 0 && (
        <ProductRail id="home-best" title={t("bestSellers")} seeAllLabel={t("seeAll")} products={bestSellers} />
      )}

      {vendors.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-12" aria-labelledby="home-vendors">
          <h2 id="home-vendors" className="mb-5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {t("stores")}
          </h2>
          <Reveal as="ul" stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      {localized(locale as Locale, v.name, v.nameAr)}
                    </p>
                    {v.description && (
                      <p className="truncate text-xs text-zinc-500">
                        {localized(locale as Locale, v.description, v.descriptionAr)}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </Reveal>
        </section>
      )}
    </>
  );
}

function ProductRail({
  id,
  title,
  seeAllLabel,
  products,
  emptyNote,
}: {
  id: string;
  title: string;
  seeAllLabel: string;
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
          {seeAllLabel}
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">{emptyNote ?? "Nothing here yet."}</p>
        </div>
      ) : (
        <Reveal stagger className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <CatalogProductCard key={p.id} product={p} />
          ))}
        </Reveal>
      )}
    </section>
  );
}
