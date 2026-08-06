import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { productService } from "@/server/services/product.service";
import {
  ProductDetailView,
  type ProductDetailData,
} from "@/features/products/components/product-detail-view";
import type { VariantView } from "@/features/products/components/variant-picker";
import { ReviewsSection } from "@/features/reviews/components/reviews-section";
import { getProductReviews } from "@/features/reviews/queries";
import { isAppError } from "@/shared/lib/errors";
import { setRequestLocale } from "next-intl/server";

type Params = { locale: string; vendor: string; slug: string };

export const revalidate = 60;

async function load(vendorSlug: string, productSlug: string) {
  const vendor = await vendorService.getBySlug(vendorSlug);
  const product = await productService.getBySlug(String(vendor._id), productSlug);
  return { vendor, product };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { vendor: vendorSlug, slug } = await params;
  try {
    const { product } = await load(vendorSlug, slug);
    const description =
      product.seo?.description ?? product.shortDescription ?? product.description.slice(0, 155);
    return {
      title: product.seo?.title ?? `${product.title} · Bazaario`,
      description,
      openGraph: {
        title: product.title,
        description,
        images: product.media[0]?.url ? [product.media[0].url] : undefined,
        type: "website",
      },
      twitter: { card: "summary_large_image", title: product.title, description },
      alternates: { canonical: `/v/${vendorSlug}/p/${slug}` },
    };
  } catch {
    return { title: "Product not found" };
  }
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { locale, vendor: vendorSlug, slug } = await params;
  setRequestLocale(locale);

  let data;
  try {
    data = await load(vendorSlug, slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { vendor, product } = data;
  if (product.status !== "active") notFound();

  const vendorId = String(vendor._id);
  const currency = vendor.settings.currency;

  // Only variable products have variants; don't pay for the query otherwise.
  const variantDocs =
    product.type === "variable" ? await productService.listVariants(vendorId, String(product._id)) : [];

  const variants: VariantView[] = variantDocs.map((v) => ({
    id: String(v._id),
    // `options` is a Mongoose Map — a plain object is what crosses to the client.
    options: Object.fromEntries(v.options as unknown as Map<string, string>),
    sku: v.sku,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? null,
    stock: v.stock,
    image: v.image ?? null,
  }));

  // Only attributes that actually define variants belong in the picker.
  const attributes = product.attributes
    .filter((a) => a.variantDefining && a.values.length > 0)
    .map((a) => ({ name: a.name, values: a.values }));

  const inStock =
    product.type === "variable"
      ? variants.some((v) => v.stock > 0)
      : !product.trackInventory || product.stock > 0 || product.allowBackorder;

  const detail: ProductDetailData = {
    id: String(product._id),
    title: product.title,
    description: product.description,
    shortDescription: product.shortDescription ?? null,
    type: product.type as "simple" | "variable",
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    stock: product.stock,
    sku: product.sku ?? null,
    inStock,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    media: product.media.map((m) => ({
      url: m.url,
      alt: m.alt ?? null,
      type: (m.type ?? "image") as "image" | "video" | "image360",
    })),
    attributes,
    variants,
    faqs: product.faqs.map((f) => ({ question: f.question, answer: f.answer })),
  };

  const reviews = await getProductReviews(String(product._id));

  // A variable product's offers are its variants, so expose the real range
  // rather than a single price a shopper may never actually be charged.
  const prices = variants.length ? variants.map((v) => v.price) : [product.price];
  const offers =
    product.type === "variable" && variants.length > 1
      ? {
          "@type": "AggregateOffer",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: variants.length,
          priceCurrency: currency,
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        }
      : {
          "@type": "Offer",
          price: product.price,
          priceCurrency: currency,
          availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: `/v/${vendorSlug}/p/${slug}`,
        };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description,
    image: product.media.map((m) => m.url),
    sku: product.sku ?? undefined,
    offers,
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
      { "@type": "ListItem", position: 1, name: vendor.name, item: `/v/${vendorSlug}` },
      { "@type": "ListItem", position: 2, name: product.title, item: `/v/${vendorSlug}/p/${slug}` },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="mb-6 text-sm text-zinc-500">
        <Link href={`/v/${vendorSlug}`} className="hover:text-indigo-600">
          {vendor.name}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{product.title}</span>
      </nav>

      <ProductDetailView
        product={detail}
        vendorId={vendorId}
        vendorSlug={vendorSlug}
        currency={currency}
      />

      <ReviewsSection
        productId={detail.id}
        reviews={reviews}
        productSlug={slug}
        vendorSlug={vendorSlug}
      />
    </div>
  );
}
