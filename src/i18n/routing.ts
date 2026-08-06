import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALES } from "./locales";

/**
 * `localePrefix: "always"` — every locale, including the default, gets a URL
 * segment (`/en/products`, `/ar/products`). Keeps the existing `locale`
 * cookie name (rather than next-intl's default `NEXT_LOCALE`) so a visitor's
 * saved preference from the pre-migration cookie-only setup survives.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: { name: LOCALE_COOKIE },
});
