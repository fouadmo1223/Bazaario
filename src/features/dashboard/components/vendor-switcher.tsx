"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { switchVendorAction } from "../actions";
import { Select } from "@/shared/components/select";
import type { VendorOption } from "@/features/platform/queries";

/**
 * Lets a super admin pick which vendor's dashboard they're currently
 * operating — the same product/order/settings pages a vendor's own staff
 * use, just pointed at a different store. Only rendered for super admins;
 * `switchVendorAction` re-asserts that server-side regardless.
 */
export function VendorSwitcher({
  vendors,
  activeId,
}: {
  vendors: VendorOption[];
  activeId: string;
}) {
  const t = useTranslations("VendorSwitcher");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label={t("label")}
      value={activeId}
      disabled={pending}
      onChange={(value) => {
        startTransition(async () => {
          await switchVendorAction(value);
          router.refresh();
        });
      }}
      className="w-44"
      options={vendors.map((v) => ({
        value: v.id,
        label: v.name + (v.status === "active" ? "" : ` (${v.status})`),
      }))}
    />
  );
}
