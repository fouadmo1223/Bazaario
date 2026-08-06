import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorBanners } from "@/features/cms/queries";
import { BannerManager } from "@/features/cms/components/banner-manager";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Banners · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardBannersPage() {
  const locale = await getLocale();
  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.CMS_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/banners")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const banners = await listVendorBanners(vendorId);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Banners
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          The announcement shown at the top of {vendor.name}&apos;s storefront.
        </p>
      </header>

      <BannerManager vendorId={vendorId} banners={banners} />
    </div>
  );
}
