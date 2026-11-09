import { describe, expect, it } from "vitest";
import { gateMoney, usdToCents } from "./money";

describe("usdToCents", () => {
  it("is exact for two-decimal amounts given as numbers or numeric strings", () => {
    expect(usdToCents(0.6, "floor")).toBe(60);
    expect(usdToCents(0.6, "ceil")).toBe(60);
    expect(usdToCents("0.40", "ceil")).toBe(40);
    expect(usdToCents(0.61, "floor")).toBe(61);
    expect(usdToCents(1, "floor")).toBe(100);
    expect(usdToCents("0", "ceil")).toBe(0);
  });
  it("rounds sub-cent values conservatively (budget down, commitments up)", () => {
    expect(usdToCents("0.6049", "floor")).toBe(60);
    expect(usdToCents("0.4001", "ceil")).toBe(41);
  });
  it("rejects invalid or negative values", () => {
    for (const v of [null, undefined, "", "abc", -0.1, Number.NaN, Number.POSITIVE_INFINITY, {}]) {
      expect(usdToCents(v, "floor")).toBeNull();
    }
  });
});

describe("gateMoney", () => {
  it("0.60 - 0.40 = 0.20 exactly (the float gap that blocked the MOSS gate)", () => {
    expect(0.6 - 0.4).toBeLessThan(0.2); // the bug being fixed
    expect(gateMoney(0.6, 0.4, 0.2)).toEqual({ availableCents: 20, canReserve: true });
  });
  it("does not admit with 0.19 available", () => {
    expect(gateMoney(0.59, 0.4, 0.2)).toEqual({ availableCents: 19, canReserve: false });
  });
  it("admits with exactly 0.20 available", () => {
    expect(gateMoney("1.00", "0.80", "0.20").canReserve).toBe(true);
    expect(gateMoney(0.2, 0, 0.2).canReserve).toBe(true);
  });
  it("does not admit beyond the budget", () => {
    expect(gateMoney(0.6, 0.6, 0.2)).toEqual({ availableCents: 0, canReserve: false });
    expect(gateMoney(0.4, 0.6, 0.2)).toEqual({ availableCents: 0, canReserve: false });
  });
  it("H3 reserve of 0.75 uses the same exact comparison", () => {
    expect(gateMoney(1.5, 0.75, "0.75").canReserve).toBe(true);
    expect(gateMoney(1.49, 0.75, "0.75").canReserve).toBe(false);
  });
  it("fails closed on invalid values or a non-positive reserve", () => {
    expect(gateMoney(null, 0, 0.2).canReserve).toBe(false);
    expect(gateMoney(1, "x", 0.2).canReserve).toBe(false);
    expect(gateMoney(1, 0, 0).canReserve).toBe(false);
    expect(gateMoney(1, 0, null).canReserve).toBe(false);
  });
});
