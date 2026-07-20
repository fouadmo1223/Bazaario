/**
 * Money arithmetic in integer minor units (cents).
 *
 * ## Why
 *
 * Totals are *stored* as floating-point numbers. A single stored value is fine —
 * 129.99 round-trips exactly. What is not fine is **summing and comparing** those
 * values, which is where every money bug in this codebase has come from:
 *
 * - 0.35 + 0.70 is 1.0499999999999998, so refunds that exactly settled a 1.05
 *   order read as *less than* the total; the order never closed and its stock was
 *   never released.
 * - 1.00 - 0.07 is 0.9299999999999999, so refunding the remaining 0.93 was
 *   rejected for exceeding a balance the error message printed as "0.93".
 *
 * ## How this prevents a repeat
 *
 * `Minor` is a *branded* number. TypeScript's arithmetic operators erase the
 * brand — `a + b` on two `Minor` values produces a plain `number` — so the result
 * cannot be assigned back to a `Minor` or returned from a function declared to
 * return one. Raw arithmetic on money therefore fails to compile, and the only
 * way through is the helpers below, which are exact by construction.
 *
 * The brand is a compile-time fiction with no runtime cost: a `Minor` *is* a
 * number, and `toMajor` is the only thing that puts a decimal back.
 *
 * ## Rounding
 *
 * `Math.round`, never `Math.trunc`. `0.29 * 100` is 28.999999999999996, which
 * truncation would turn into 28 — a lost cent on every such amount.
 *
 * **`toMinor` expects an amount that is already whole cents.** Half-cent inputs
 * are not reliably rounded and cannot be: the information is already gone by the
 * time the value arrives. `1.005 * 100` is 100.49999999999999 and rounds *down*
 * to 100, while `8.115 * 100` is exactly 811.5 and rounds *up* to 812 — the
 * difference is which way each decimal happened to fall when it was first
 * converted to binary, not anything this module can inspect.
 *
 * That precondition holds today because prices and totals are rounded to two
 * decimals before they are stored. It is also the argument for eventually
 * storing minor units at rest: then there is no conversion to get wrong.
 *
 * ## Currency exponent
 *
 * **Assumes a two-decimal currency.** That assumption already ran through the
 * codebase before this module existed (the Stripe adapter sent `amount * 100`),
 * so nothing is narrowed here — it is just written down and confined to one
 * file. Supporting JOD or KWD, which have three decimals, means teaching this
 * module the currency's exponent; nothing outside it should need to change.
 */

declare const minorUnitBrand: unique symbol;

/** An integer number of cents. Construct with `toMinor` or `cents`. */
export type Minor = number & { readonly [minorUnitBrand]: "MinorUnits" };

/** The zero amount, for use as a reduce seed. */
export const ZERO = 0 as Minor;

/** Convert a stored/display decimal amount (12.34) into cents (1234). */
export function toMinor(amount: number): Minor {
  return Math.round(amount * 100) as Minor;
}

/** Convert cents (1234) back to the decimal amount (12.34) for storage or display. */
export function toMajor(value: Minor): number {
  return value / 100;
}

/** Construct from a literal cent count, e.g. `cents(1999)`. */
export function cents(value: number): Minor {
  return Math.round(value) as Minor;
}

export function addMinor(a: Minor, b: Minor): Minor {
  return (a + b) as Minor;
}

export function subMinor(a: Minor, b: Minor): Minor {
  return (a - b) as Minor;
}

/** Multiply by a whole count — a line total from a unit price and quantity. */
export function timesQuantity(unit: Minor, quantity: number): Minor {
  return (unit * Math.round(quantity)) as Minor;
}

/**
 * Take a percentage of an amount, rounded to the nearest cent.
 *
 * `rate` is a percentage (14 = 14%), not a fraction, matching how coupons and
 * tax rates are configured.
 */
export function percentOf(value: Minor, ratePercent: number): Minor {
  return Math.round((value * ratePercent) / 100) as Minor;
}

export function sumMinor(values: readonly Minor[]): Minor {
  return values.reduce<Minor>((total, value) => addMinor(total, value), ZERO);
}

/** Sum stored decimal amounts exactly, converting each as it goes. */
export function sumAmounts(amounts: readonly number[]): Minor {
  return amounts.reduce<Minor>((total, amount) => addMinor(total, toMinor(amount)), ZERO);
}

export function minMinor(a: Minor, b: Minor): Minor {
  return (a < b ? a : b) as Minor;
}

export function maxMinor(a: Minor, b: Minor): Minor {
  return (a > b ? a : b) as Minor;
}

/** Clamp to zero — a discount must never make a total negative. */
export function clampToZero(value: Minor): Minor {
  return (value < 0 ? 0 : value) as Minor;
}
