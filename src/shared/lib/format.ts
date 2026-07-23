/**
 * Presentation formatters shared by server and client components.
 *
 * The locale is **pinned**, not left to the runtime default: `Intl` resolves an
 * undefined locale from the host environment, and the server (Node's ICU) and
 * the browser disagree — USD renders "US$68.00" on one and "$68.00" on the
 * other, so a price formatted on the server mismatches the client on hydration.
 * A fixed default makes the two agree. Callers may still override it, and once
 * next-intl lands these take the active locale explicitly.
 */

const DEFAULT_LOCALE = "en-US";

export function formatMoney(
  amount: number,
  currency: string,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

/** Percentage saved against a compare-at price, rounded for display. */
export function discountPercent(price: number, compareAtPrice: number): number {
  if (compareAtPrice <= 0 || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}
