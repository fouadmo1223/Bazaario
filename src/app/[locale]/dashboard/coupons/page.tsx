import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorCoupons, getCouponFormOptions } from "@/features/coupons/queries";
import { CouponTable } from "@/features/coupons/components/coupon-table";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Coupons · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardCouponsPage() {
  const locale = await getLocale();
  const t = await getTranslations("DashboardCoupons");
  // Auth resolves here, before anything streams — a redirect thrown after a
  // Suspense shell flushes cannot set a status line, stranding the visitor.
  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.COUPON_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/coupons")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const [coupons, options] = await Promise.all([
    listVendorCoupons(vendorId),
    getCouponFormOptions(vendorId),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t("count", { count: coupons.length, vendor: vendor.name })}
        </p>
      </header>

      <CouponTable
        coupons={coupons}
        vendorId={vendorId}
        currency={vendor.settings.currency}
        products={options.products}
        categories={options.categories}
      />
    </div>
  );
}
