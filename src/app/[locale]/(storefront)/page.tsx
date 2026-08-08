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

      <section className="relative overflow-hidden border-b border-border-subtle bg-background">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-12 lg:gap-10 lg:py-0">
          {/* Text carries the LCP: the display headline paints before the
              image below finishes decoding, so it's slide-only (no fade). */}
          <div className="lg:order-2 lg:col-span-7 lg:py-24">
            <Reveal immediate fade={false}>
              <p className="font-mono text-xs font-medium tracking-[0.15em] text-brand uppercase">
                {t("heroEyebrow", { count: vendors.length })}
              </p>
            </Reveal>

            <Reveal immediate fade={false} delay={0.05}>
              <h1 className="mt-3 max-w-xl font-display text-5xl leading-[0.98] font-medium tracking-[-0.02em] text-balance text-foreground sm:text-6xl lg:text-7xl">
                {t("heroTitle")}
              </h1>
            </Reveal>

            <Reveal immediate delay={0.15}>
              <p className="mt-6 max-w-md text-lg leading-8 text-text-secondary">{t("heroSubtitle")}</p>
            </Reveal>

            <Reveal immediate delay={0.25} className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/products"
                className="rounded-btn bg-brand px-5 py-3 text-sm font-semibold text-white shadow-xs transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-sm"
              >
                {t("browseProducts")}
              </Link>
              <Link
                href="/categories"
                className="rounded-btn border border-border-default px-5 py-3 text-sm font-medium text-foreground transition hover:-translate-y-0.5 hover:border-brand"
              >
                {t("shopByCategory")}
              </Link>
            </Reveal>
          </div>

          <Reveal
            immediate
            delay={0.1}
            from="right"
            as="div"
            className="relative order-first aspect-[4/3] w-full overflow-hidden rounded-card lg:order-1 lg:col-span-5 lg:aspect-auto lg:h-[32rem]"
          >
            {featured[0]?.image ? (
              <>
                <Image
                  src={featured[0].image}
                  alt=""
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="object-cover grayscale-[35%] contrast-[1.05]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-brand-900/45 via-brand-700/10 to-transparent mix-blend-multiply"
                />
                <div aria-hidden className="absolute inset-0 bg-brand/15 mix-blend-color" />
              </>
            ) : (
              <div className="h-full w-full bg-brand/10" />
            )}
          </Reveal>
        </div>
      </section>

      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" aria-labelledby="home-categories">
          <div className="mb-8 flex items-baseline justify-between">
            <h2 id="home-categories" className="text-2xl font-semibold text-foreground">
              {t("categories")}
            </h2>
            <Link href="/categories" className="text-sm font-medium text-brand hover:underline">
              {t("allCategories")}
            </Link>
          </div>
          <Reveal as="ul" stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/categories/${c.slug}`}
                  className="group relative flex h-28 items-end overflow-hidden rounded-card border border-border-subtle p-3 transition hover:border-border-default hover:shadow-xs"
                >
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt=""
                      fill
                      sizes="200px"
                      className="object-cover grayscale-[50%] transition duration-300 group-hover:scale-105 group-hover:grayscale-0"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-surface-raised" />
                  )}
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                  <span className="relative text-sm font-medium text-white">
                    {localized(locale as Locale, c.name, c.nameAr)}
                  </span>
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
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" aria-labelledby="home-vendors">
          <h2 id="home-vendors" className="mb-8 text-2xl font-semibold text-foreground">
            {t("stores")}
          </h2>
          <Reveal as="ul" stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vendors.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/v/${v.slug}`}
                  className="flex items-center gap-3 rounded-card border border-border-subtle p-4 transition hover:-translate-y-0.5 hover:border-border-default hover:shadow-xs"
                >
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-raised">
                    {v.logo ? (
                      <Image src={v.logo} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-sm font-semibold text-text-tertiary">
                        {v.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {localized(locale as Locale, v.name, v.nameAr)}
                    </p>
                    {v.description && (
                      <p className="truncate text-xs text-text-tertiary">
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
    <section className="mx-auto max-w-6xl px-6 py-16 md:py-24" aria-labelledby={id}>
      <div className="mb-8 flex items-baseline justify-between">
        <h2 id={id} className="text-2xl font-semibold text-foreground">
          {title}
        </h2>
        <Link href="/products" className="text-sm font-medium text-brand hover:underline">
          {seeAllLabel}
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-secondary">{emptyNote ?? "Nothing here yet."}</p>
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
