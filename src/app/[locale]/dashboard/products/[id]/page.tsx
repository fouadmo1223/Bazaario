import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getProductForEdit, getProductFormOptions } from "@/features/products/queries";
import { EditProductPage as EditProductForm } from "@/features/products/components/edit-product-page";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

type Params = { id: string };

export const metadata: Metadata = {
  title: "Edit product · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<Params> }) {
  const locale = await getLocale();
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent(`/dashboard/products/${id}`)}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const [product, options] = await Promise.all([
    getProductForEdit(vendorId, id),
    getProductFormOptions(vendorId),
  ]);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/dashboard/products" className="hover:text-indigo-600">
          Products
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">{product.title}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Edit product
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{product.title}</p>
      </header>

      <EditProductForm
        vendorId={vendorId}
        categories={options.categories}
        brands={options.brands}
        initial={product}
      />
    </div>
  );
}
