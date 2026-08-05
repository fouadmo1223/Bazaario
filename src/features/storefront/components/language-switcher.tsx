"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, LOCALE_COOKIE, type Locale } from "@/i18n/locales";

/**
 * Sets the locale cookie and asks the server to re-render with it — there's
 * no `[locale]` route segment for a `Link` to point at, so this is the
 * entire mechanism.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations("Language");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => router.refresh());
  }

  return (
    <label>
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as Locale)}
        aria-label={t("label")}
        className="rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 text-sm text-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
