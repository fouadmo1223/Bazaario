import { describe, it, expect } from "vitest";
import {
  toMinor,
  toMajor,
  cents,
  addMinor,
  subMinor,
  timesQuantity,
  percentOf,
  sumMinor,
  sumAmounts,
  minMinor,
  clampToZero,
  ZERO,
} from "@/shared/lib/money";

/**
 * The money primitives.
 *
 * Fast and pure, so this is the suite that should grow whenever a new rounding
 * rule appears. The cases named "regression" are the exact amounts that
 * produced real bugs in the refund path.
 */

describe("conversion", () => {
  it("round-trips ordinary amounts", () => {
    for (const amount of [0, 0.01, 1, 12.34, 129.99, 1000000.55]) {
      expect(toMajor(toMinor(amount))).toBe(amount);
    }
  });

  /**
   * The reason conversion rounds instead of truncating: 0.29 * 100 is
   * 28.999999999999996 in binary, and `Math.trunc` would bank that as 28 —
   * losing a cent on every such amount, in the platform's favour, invisibly.
   */
  it("does not lose a cent on amounts that multiply inexactly", () => {
    expect(0.29 * 100).not.toBe(29); // the hazard being guarded against
    expect(toMinor(0.29)).toBe(29);
    expect(toMinor(0.07)).toBe(7);
    expect(toMinor(8.11)).toBe(811);
  });

  /**
   * Documents a limitation rather than a guarantee.
   *
   * A half-cent input cannot be rounded predictably, because the value has
   * already lost the information by the time it gets here: 1.005 is stored as
   * 1.00499999999999989 and rounds *down*, while 8.115 lands exactly on 811.5
   * and rounds *up*. Callers must pass amounts that are already whole cents —
   * which everything stored is, since totals are rounded before they are saved.
   *
   * If this assertion ever fails it means the platform started producing
   * sub-cent amounts, and the fix is upstream, not here.
   */
  it("cannot round half-cent inputs predictably (documented limitation)", () => {
    expect(toMinor(1.005)).toBe(100); // rounds down
    expect(toMinor(8.115)).toBe(812); // rounds up
  });

  it("builds from literal cents", () => {
    expect(cents(1999)).toBe(1999);
    expect(toMajor(cents(1999))).toBe(19.99);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts exactly", () => {
    expect(addMinor(toMinor(0.1), toMinor(0.2))).toBe(30);
    expect(toMajor(addMinor(toMinor(0.1), toMinor(0.2)))).toBe(0.3);
    expect(subMinor(toMinor(1), toMinor(0.07))).toBe(93);
  });

  it("multiplies by a quantity", () => {
    expect(timesQuantity(toMinor(19.99), 3)).toBe(5997);
    expect(toMajor(timesQuantity(toMinor(19.99), 3))).toBe(59.97);
  });

  it("takes a percentage, rounded to the nearest cent", () => {
    expect(percentOf(toMinor(100), 14)).toBe(1400);
    // 8.11 * 14% = 1.1354 → 1.14
    expect(percentOf(toMinor(8.11), 14)).toBe(114);
    expect(percentOf(toMinor(0.01), 50)).toBe(1); // 0.5c rounds up
  });

  it("sums without accumulating error", () => {
    expect(sumMinor([toMinor(0.35), toMinor(0.7)])).toBe(105);
    expect(sumAmounts([0.35, 0.7])).toBe(105);
    expect(sumMinor([])).toBe(ZERO);
  });

  it("clamps and picks minima", () => {
    expect(clampToZero(subMinor(toMinor(5), toMinor(8)))).toBe(0);
    expect(minMinor(toMinor(10), toMinor(4))).toBe(400);
  });
});

describe("the bugs this module exists to prevent", () => {
  /**
   * Regression: 0.35 + 0.70 is 1.0499999999999998 as floats, so a refund that
   * exactly settled a 1.05 order compared as *less than* the total. The order
   * stayed "partially refunded" and its stock was never released.
   */
  it("sees partial refunds of 0.35 and 0.70 as settling 1.05 exactly", () => {
    expect(0.35 + 0.7).toBeLessThan(1.05); // the float behaviour that caused it

    const total = toMinor(1.05);
    const refunded = sumAmounts([0.35, 0.7]);
    expect(refunded).toBe(total);
    expect(refunded >= total).toBe(true);
  });

  /**
   * Regression: 1.00 - 0.07 is 0.9299999999999999, so refunding the remaining
   * 0.93 was rejected for exceeding a balance printed as "0.93".
   */
  it("sees 0.93 as exactly the remainder of 1.00 after 0.07", () => {
    expect(1 - 0.07).toBeLessThan(0.93); // the float behaviour that caused it

    const remaining = subMinor(toMinor(1), toMinor(0.07));
    expect(remaining).toBe(toMinor(0.93));
    expect(toMinor(0.93) > remaining).toBe(false);
  });

  /**
   * A long tail of small amounts is where drift would otherwise compound. Three
   * hundred additions of 0.07 must be exactly 21.00, not 21.000000000000114.
   */
  it("does not drift over many additions", () => {
    const naive = Array.from({ length: 300 }, () => 0.07).reduce((s, n) => s + n, 0);
    expect(naive).not.toBe(21);

    const exact = sumAmounts(Array.from({ length: 300 }, () => 0.07));
    expect(toMajor(exact)).toBe(21);
  });
});
