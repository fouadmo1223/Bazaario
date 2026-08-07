import type { Locale } from "@/i18n/locales";

/**
 * Picks a vendor-entered Arabic value over the English one when the current
 * locale is Arabic and a translation was actually provided — an empty/unset
 * `ar` value falls back to `en` rather than showing blank. Names, titles, and
 * descriptions are vendor content, not UI strings, so they don't go through
 * next-intl's message catalogs; this is the equivalent for that kind of field.
 */
export function localized(locale: Locale, en: string, ar?: string | null): string {
  return locale === "ar" && ar ? ar : en;
}
