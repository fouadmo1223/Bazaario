import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorProducts, getProductFormOptions } from "@/features/products/queries";
import { ProductTable } from "@/features/products/components/product-table";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

type Search = { page?: string; search?: string; status?: string };

export const metadata: Metadata = {
  title: "Products · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUSES = ["active", "draft", "archived"] as const;

export default async function DashboardProductsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { page, search, status } = await searchParams;

  // Auth resolves here, before anything streams — see the note on the dashboard
  // overview: a redirect thrown after a Suspense shell flushes cannot set a
  // status line, and the visitor is stranded on the fallback.
  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect(`/login?next=${encodeURIComponent("/dashboard/products")}`);
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const [products, options] = await Promise.all([
    listVendorProducts(vendorId, { page, search, status }),
    getProductFormOptions(vendorId),
  ]);

  const activeStatus = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : undefined;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Products
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {products.total} {products.total === 1 ? "product" : "products"} in {vendor.name}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <form action="/dashboard/products" className="flex gap-2">
          <label htmlFor="product-search" className="sr-only">
            Search products
          </label>
          <input
            id="product-search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search…"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          <button
            type="submit"
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Search
          </button>
        </form>

        <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
          <Chip label="All" href="/dashboard/products" active={!activeStatus} />
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={s}
              href={`/dashboard/products?status=${s}`}
              active={activeStatus === s}
            />
          ))}
        </nav>
      </div>

      <ProductTable
        products={products.items}
        vendorId={vendorId}
        vendorSlug={vendor.slug}
        currency={vendor.settings.currency}
        categories={options.categories}
        brands={options.brands}
      />

      {products.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <PageLink page={products.page - 1} status={activeStatus} search={search} disabled={!products.hasPrev}>
            ← Previous
          </PageLink>
          <span className="text-sm text-zinc-500">
            Page {products.page} of {products.totalPages}
          </span>
          <PageLink page={products.page + 1} status={activeStatus} search={search} disabled={!products.hasNext}>
            Next →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
        active
          ? "bg-indigo-600 text-white"
          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
}

function PageLink({
  page,
  status,
  search,
  disabled,
  children,
}: {
  page: number;
  status?: string;
  search?: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm text-zinc-300 dark:text-zinc-700">{children}</span>;
  }
  const query = new URLSearchParams({
    page: String(page),
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  });
  return (
    <Link
      href={`/dashboard/products?${query}`}
      className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {children}
    </Link>
  );
}
