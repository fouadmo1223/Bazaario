"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { suspendVendorUserAction } from "../actions";
import type { VendorStaff } from "../queries";

/**
 * Who has access to each vendor, with a way to take it away.
 *
 * Revoking suspends the membership rather than deleting it: audit entries and
 * `invitedBy` point at it, and removing the row turns a staffing history into
 * dangling ids. The owner has no revoke button because the service refuses it —
 * showing a control that always errors is worse than not showing one.
 */

export function VendorStaffList({ groups }: { groups: VendorStaff[] }) {
  const t = useTranslations("VendorStaffList");
  const ROLE_LABELS: Record<string, string> = {
    vendor: t("roleVendorAdmin"),
    marketing: t("roleMarketing"),
    support: t("roleSupport"),
    delivery_driver: t("roleDeliveryDriver"),
  };
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function revoke(vendorId: string, userId: string, email: string) {
    if (!confirm(t("confirmRemove", { email }))) return;
    setError(null);
    setBusy(`${vendorId}:${userId}`);
    startTransition(async () => {
      const result = await suspendVendorUserAction(vendorId, userId);
      setBusy(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  if (groups.length === 0) {
    return <p className="text-sm text-text-tertiary">{t("noVendorsYet")}</p>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {groups.map(({ vendor, staff }) => (
        <section
          key={vendor.id}
          className="rounded-2xl border border-border-subtle transition hover:border-border-default hover:shadow-sm"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {vendor.name}
              </h3>
              <p className="text-xs text-text-tertiary">/v/{vendor.slug}</p>
            </div>
            {vendor.status !== "active" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {vendor.status}
              </span>
            ) : null}
          </header>

          {staff.length === 0 ? (
            <p className="px-4 py-3 text-sm text-text-tertiary">{t("noStaffYet")}</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {staff.map((m) => (
                <li
                  key={m.membershipId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {m.name}{" "}
                      {m.isOwner ? (
                        <span className="ml-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                          {t("owner")}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-text-tertiary">{m.email}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-tertiary">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                    {m.status !== "active" ? (
                      <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                        {m.status}
                      </span>
                    ) : m.isOwner ? null : (
                      <button
                        type="button"
                        disabled={pending && busy === `${vendor.id}:${m.userId}`}
                        onClick={() => revoke(vendor.id, m.userId, m.email)}
                        className="rounded-lg px-2 py-1 text-xs text-text-tertiary transition hover:text-red-600 disabled:opacity-50"
                      >
                        {pending && busy === `${vendor.id}:${m.userId}` ? t("removing") : t("remove")}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
