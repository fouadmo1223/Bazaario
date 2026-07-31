import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { productService } from "@/server/services/product.service";
import { getActiveBanner } from "@/features/cms/queries";
import { ProductCard, type ProductCardData } from "@/features/storefront/components/product-card";
import { isAppError } from "@/shared/lib/errors";

type Params = { vendor: string };
type Search = { page?: string; search?: string; sort?: string };

// Storefront listings are ISR-cached; mutations revalidate via Redis + tags.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { vendor: slug } = await params;
  try {
    const vendor = await vendorService.getBySlug(slug);
    return {
      title: `${vendor.name} · Commerce`,
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
  const { vendor: slug } = await params;
  const { page = "1", search } = await searchParams;

  let vendor;
  try {
    vendor = await vendorService.getBySlug(slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

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
    <div className="min-h-dvh bg-zinc-50 dark:bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {banner && (
        <div className="bg-indigo-600 px-6 py-2 text-center text-sm text-white">
          {banner.message}
          {banner.linkUrl && (
            <a href={banner.linkUrl} className="ml-2 font-semibold underline underline-offset-2">
              {banner.linkLabel || "Learn more"}
            </a>
          )}
        </div>
      )}

      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {vendor.name}
            </h1>
            {vendor.description && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{vendor.description}</p>
            )}
          </div>

          {/*
            Pre-purchase contact. The order page already links to a thread scoped
            to an order; this covers the questions that come *before* there is an
            order to attach — sizing, stock, delivery — which is most of them.
            Signed out, it routes through login and comes back here.
          */}
          <Link
            href={`/v/${slug}/contact`}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Message store
          </Link>
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
