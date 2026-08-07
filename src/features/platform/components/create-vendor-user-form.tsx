"use client";

import { useActionState, useId } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useEffect } from "react";
import { createVendorUserAction } from "../actions";
import type { VendorOption } from "../queries";
import { Select } from "@/shared/components/select";

/**
 * Add a person to a vendor's team.
 *
 * One form covers both "this person is new" and "this person already shops
 * here": an admin typing an email does not reliably know which, and failing
 * with "already registered" would be a dead end when the existing account is
 * exactly who they meant. The password is only used on the first path — the
 * hint says so, because an admin who thinks they just reset someone's password
 * would be wrong.
 */

type FieldErrors = Record<string, string[] | undefined>;

export function CreateVendorUserForm({ vendors }: { vendors: VendorOption[] }) {
  const t = useTranslations("CreateVendorUserForm");
  const router = useRouter();
  const formId = useId();
  const [state, formAction, pending] = useActionState(createVendorUserAction, null);

  const ROLE_OPTIONS = [
    { value: "vendor", label: t("roleVendorAdmin"), hint: t("roleVendorAdminHint") },
    { value: "marketing", label: t("roleMarketing"), hint: t("roleMarketingHint") },
    { value: "support", label: t("roleSupport"), hint: t("roleSupportHint") },
    { value: "delivery_driver", label: t("roleDeliveryDriver"), hint: t("roleDeliveryDriverHint") },
  ] as const;

  // A new membership changes the staff lists rendered by the server component
  // above; revalidatePath alone does not refresh an already-mounted tree.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const fieldErrors =
    (state && !state.ok
      ? (state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors
      : undefined) ?? {};

  const field =
    "mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";
  const label = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";
  const errorText = "mt-1 text-xs text-red-600 dark:text-red-400";

  if (vendors.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
        {t("createVendorFirst")}
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state?.ok ? (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {String(state.meta?.message ?? t("done"))}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-vendor`} className={label}>
            {t("vendor")}
          </label>
          <Select
            id={`${formId}-vendor`}
            name="vendorId"
            required
            defaultValue={vendors[0]?.id}
            className="mt-1"
            options={vendors.map((v) => ({
              value: v.id,
              label: v.name + (v.status === "active" ? "" : ` (${v.status})`),
            }))}
          />
          {fieldErrors.vendorId ? <p className={errorText}>{fieldErrors.vendorId[0]}</p> : null}
        </div>

        <div>
          <label htmlFor={`${formId}-role`} className={label}>
            {t("roleOnVendor")}
          </label>
          <Select
            id={`${formId}-role`}
            name="role"
            required
            defaultValue="support"
            className="mt-1"
            options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: `${r.label} — ${r.hint}` }))}
          />
          {fieldErrors.role ? <p className={errorText}>{fieldErrors.role[0]}</p> : null}
        </div>

        <div>
          <label htmlFor={`${formId}-email`} className={label}>
            {t("email")}
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder={t("emailPlaceholder")}
            className={field}
          />
          {fieldErrors.email ? (
            <p className={errorText}>{fieldErrors.email[0]}</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">{t("emailHint")}</p>
          )}
        </div>

        <div>
          <label htmlFor={`${formId}-name`} className={label}>
            {t("name")}
          </label>
          <input
            id={`${formId}-name`}
            name="name"
            required
            minLength={2}
            maxLength={80}
            className={field}
          />
          {fieldErrors.name ? <p className={errorText}>{fieldErrors.name[0]}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={`${formId}-password`} className={label}>
            {t("initialPassword")}
          </label>
          <input
            id={`${formId}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            className={field}
          />
          {fieldErrors.password ? (
            <p className={errorText}>{fieldErrors.password[0]}</p>
          ) : (
            <p className="mt-1 text-xs text-zinc-400">{t("passwordHint")}</p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? t("adding") : t("addToVendor")}
      </button>
    </form>
  );
}
