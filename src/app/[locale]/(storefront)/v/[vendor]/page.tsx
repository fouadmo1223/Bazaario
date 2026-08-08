import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { notFound } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { productService } from "@/server/services/product.service";
import { getActiveBanner } from "@/features/cms/queries";
import { ProductCard, type ProductCardData } from "@/features/storefront/components/product-card";
import { isAppError } from "@/shared/lib/errors";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/shared/lib/localized";
import type { Locale } from "@/i18n/locales";

type Params = { locale: string; vendor: string };
type Search = { page?: string; search?: string; sort?: string };

// Storefront listings are ISR-cached; mutations revalidate via Redis + tags.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { vendor: slug } = await params;
  try {
    const vendor = await vendorService.getBySlug(slug);
    return {
      title: `${vendor.name} · Bazaario`,
      description: vendor.description ?? `Shop ${vendor.name}`,
      openGraph: {
        title: vendor.name,
        description: vendor.description ?? undefined,
        images: vendor.banner ? [vendor.banner] : undefined,
        type: "website",
      },
      twitter: { card: "summary_large_image", title: vendor.name },
      alternates: { canonical: `/v/${slug}` },
    };
  } catch {
    return { title: "Vendor not found" };
  }
}

export default async function VendorPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { locale, vendor: slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("VendorPage");
  const { page = "1", search } = await searchParams;

  let vendor;
  try {
    vendor = await vendorService.getBySlug(slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const vendorName = localized(locale as Locale, vendor.name, vendor.nameAr);
  const vendorDescription = vendor.description
    ? localized(locale as Locale, vendor.description, vendor.descriptionAr)
    : null;

  const [result, banner] = await Promise.all([
    productService.listStorefront(String(vendor._id), {
      page,
      limit: 12,
      ...(search ? { search } : {}),
    }),
    getActiveBanner(String(vendor._id)),
  ]);

  const products: ProductCardData[] = result.items.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    titleAr: p.titleAr,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    image: p.image,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    stock: p.stock,
  }));

  // Organization + breadcrumb structured data for search engines.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: vendor.name,
    description: vendor.description ?? undefined,
    image: vendor.logo ?? undefined,
  };

  return (
    <div className="min-h-dvh bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {banner && (
        <div className="bg-brand px-6 py-2 text-center text-sm text-white">
          {banner.message}
          {banner.linkUrl && (
            <a href={banner.linkUrl} className="ms-2 font-semibold underline underline-offset-2">
              {banner.linkLabel || t("learnMore")}
            </a>
          )}
        </div>
      )}

      <header className="relative overflow-hidden border-b border-border-subtle">
        {vendor.banner && (
          <>
            <div className="absolute inset-0">
              <Image src={vendor.banner} alt="" fill sizes="100vw" className="object-cover grayscale-[30%]" />
            </div>
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/40"
            />
          </>
        )}
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 py-10 md:py-14">
          <div>
            <h1 className="font-display text-3xl font-medium tracking-[-0.01em] text-foreground">
              {vendorName}
            </h1>
            {vendorDescription && <p className="mt-1 text-sm text-text-secondary">{vendorDescription}</p>}
          </div>

          {/*
            Pre-purchase contact. The order page already links to a thread scoped
            to an order; this covers the questions that come *before* there is an
            order to attach — sizing, stock, delivery — which is most of them.
            Signed out, it routes through login and comes back here.
          */}
          <Link
            href={`/v/${slug}/contact`}
            className="rounded-btn border border-border-default bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-brand"
          >
            {t("messageStore")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="mb-4 text-sm text-text-secondary">
          {t("products", { count: result.total })}
          {search ? t("resultsFor", { search }) : ""}
        </p>

        {products.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-default p-12 text-center">
            <p className="text-sm text-text-secondary">{t("noProducts")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                vendorSlug={slug}
                currency={vendor.settings.currency}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
