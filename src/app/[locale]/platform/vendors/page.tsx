import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireSuperAdminPage } from "@/features/platform/guard";
import { listVendorOptions, listVendorsWithStaff } from "@/features/platform/queries";
import { CreateVendorUserForm } from "@/features/platform/components/create-vendor-user-form";
import { VendorStaffList } from "@/features/platform/components/vendor-staff-list";

export const metadata: Metadata = { title: "Vendors & staff · Platform" };

/**
 * Vendors and who can act on them.
 *
 * Guards again even though the layout already did: the layout protects the
 * chrome, and a page that assumed it had run would be one refactor away from
 * being reachable on its own.
 */
export default async function PlatformVendorsPage() {
  await requireSuperAdminPage();
  const t = await getTranslations("PlatformVendors");

  const [vendors, groups] = await Promise.all([listVendorOptions(), listVendorsWithStaff()]);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{t("title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t("subtitle")}</p>
      </div>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("addTeamMember")}</h2>
        <div className="mt-4">
          <CreateVendorUserForm vendors={vendors} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {t("currentAccess")}
        </h2>
        <VendorStaffList groups={groups} />
      </section>
    </main>
  );
}
