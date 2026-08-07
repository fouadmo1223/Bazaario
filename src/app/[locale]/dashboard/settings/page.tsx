import type { Metadata } from "next";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { toVendorSettingsView } from "@/features/settings/queries";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Settings · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const locale = await getLocale();
  const t = await getTranslations("DashboardSettings");
  // Auth resolves here, before anything streams — a redirect thrown after a
  // Suspense shell flushes cannot set a status line, stranding the visitor.
  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.CMS_WRITE);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/settings")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </header>

      <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <SettingsForm vendorId={vendorId} initial={toVendorSettingsView(vendor)} />
      </div>
    </div>
  );
}
