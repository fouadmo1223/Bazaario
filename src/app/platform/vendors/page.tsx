import type { Metadata } from "next";
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

  const [vendors, groups] = await Promise.all([listVendorOptions(), listVendorsWithStaff()]);

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Vendors &amp; staff</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add someone to a vendor&apos;s team. If they already have an account, they keep it and
          simply gain the role.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add a team member</h2>
        <div className="mt-4">
          <CreateVendorUserForm vendors={vendors} />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Current access
        </h2>
        <VendorStaffList groups={groups} />
      </section>
    </main>
  );
}
