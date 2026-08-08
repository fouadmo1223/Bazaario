import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorCategories } from "@/features/categories/queries";
import { CategoryTable } from "@/features/categories/components/category-table";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Categories · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardCategoriesPage() {
  const locale = await getLocale();
  const t = await getTranslations("DashboardCategories");
  // Auth resolves here, before anything streams — a redirect thrown after a
  // Suspense shell flushes cannot set a status line, stranding the visitor.
  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.PRODUCT_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/categories")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const categories = await listVendorCategories(vendorId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
          {t("count", { count: categories.length, vendor: vendor.name })}
        </p>
      </header>

      <CategoryTable categories={categories} vendorId={vendorId} />
    </div>
  );
}
