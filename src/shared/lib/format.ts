/**
 * Presentation formatters shared by server and client components.
 *
 * Locale is intentionally left undefined so `Intl` resolves the runtime default.
 * Once next-intl lands, these take the active locale explicitly.
 */

export function formatMoney(amount: number, currency: string, locale?: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/** Percentage saved against a compare-at price, rounded for display. */
export function discountPercent(price: number, compareAtPrice: number): number {
  if (compareAtPrice <= 0 || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}
