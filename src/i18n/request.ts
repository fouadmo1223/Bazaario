import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

/**
 * Locale comes from the `[locale]` route segment now (via `requestLocale`,
 * populated by the proxy's locale-detection redirect), not a cookie — that's
 * what lets static pages render per-locale at build time instead of forcing
 * every request dynamic.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
