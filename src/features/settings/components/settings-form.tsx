"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updateVendorSettingsAction } from "../actions";
import type { VendorSettingsView } from "../queries";

export function SettingsForm({ vendorId, initial }: { vendorId: string; initial: VendorSettingsView }) {
  const t = useTranslations("SettingsForm");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      nameAr: String(form.get("nameAr") ?? "").trim() || undefined,
      description: String(form.get("description") ?? "").trim() || null,
      descriptionAr: String(form.get("descriptionAr") ?? "").trim() || null,
    };

    startTransition(async () => {
      const result = await updateVendorSettingsAction(vendorId, payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="field-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("storeName")}
          </label>
          <input
            id="field-name"
            name="name"
            required
            defaultValue={initial.name}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label htmlFor="field-nameAr" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("storeNameArLabel")}
          </label>
          <input
            id="field-nameAr"
            name="nameAr"
            dir="rtl"
            defaultValue={initial.nameAr}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500">{t("storeNameArHint")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="field-description"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t("description")}
          </label>
          <textarea
            id="field-description"
            name="description"
            rows={4}
            defaultValue={initial.description}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>
        <div>
          <label
            htmlFor="field-descriptionAr"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {t("descriptionArLabel")}
          </label>
          <textarea
            id="field-descriptionAr"
            name="descriptionAr"
            dir="rtl"
            rows={4}
            defaultValue={initial.descriptionAr}
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <p className="mt-1 text-xs text-zinc-500">{t("descriptionArHint")}</p>
        </div>
      </div>

      {saved && !error && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? t("saving") : t("saveChanges")}
      </button>
    </form>
  );
}
