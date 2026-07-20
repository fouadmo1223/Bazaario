/**
 * Money arithmetic in integer minor units.
 *
 * Totals are stored as floating-point numbers, which cannot represent most
 * decimal amounts exactly. That is harmless for a single value but not for
 * comparisons and running sums: 0.35 + 0.70 is 1.0499999999999998, so a refund
 * that exactly settles a 1.05 order reads as *less than* the total and the
 * order never closes. Likewise 1.00 - 0.07 is 0.9299999999999999, so refunding
 * the remaining 0.93 is rejected as exceeding a balance the error message
 * prints as "0.93".
 *
 * Converting to whole cents first makes both comparisons exact. `Math.round`
 * absorbs the representation error rather than truncating it: `0.29 * 100` is
 * 28.999999999999996, which `Math.trunc` would turn into 28 — a lost cent on
 * every such amount.
 *
 * **Assumes a two-decimal currency.** That assumption already runs through the
 * codebase (the Stripe adapter sends `amount * 100` as the minor unit), so this
 * does not narrow anything. Adding JOD or KWD, which have three, means teaching
 * both places the currency's exponent.
 */

/** 12.34 → 1234. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

/** 1234 → 12.34. */
export function fromMinorUnits(minor: number): number {
  return minor / 100;
}

/** Sum amounts without accumulating representation error. */
export function sumMinorUnits(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + toMinorUnits(amount), 0);
}
