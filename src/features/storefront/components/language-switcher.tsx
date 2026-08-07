"use client";

import { useTransition } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LOCALES, type Locale } from "@/i18n/locales";
import { Select } from "@/shared/components/select";
import { rememberLocaleAction } from "@/features/profile/actions";

/**
 * Switches the URL's `[locale]` segment in place — `usePathname()` here is
 * next-intl's locale-stripped version, so `router.replace(pathname, {locale})`
 * lands on the same page under the new locale rather than needing a manual
 * cookie + full refresh.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations("Language");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function change(next: Locale) {
    if (next === locale) return;
    void rememberLocaleAction(next);
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <Select
      value={locale}
      disabled={pending}
      onChange={(v) => change(v as Locale)}
      aria-label={t("label")}
      options={LOCALES.map((l) => ({ value: l, label: t(l) }))}
      className="w-32"
    />
  );
}
