/**
 * Exact USD arithmetic for the GPU admission gates, in integer cents.
 *
 * Postgres `numeric` is exact, so the SQL admission (`committed + reserve <= budget`) never suffers
 * from rounding. JavaScript doubles do: 0.60 - 0.40 = 0.19999999999999996 < 0.20, so the UI used to
 * report "not ready" for an admission SQL would accept. Comparing integer cents removes that gap.
 *
 * Sub-cent values (the columns are unbounded `numeric`) are rounded in the conservative direction:
 * the budget down, commitments and reserves up. The UI can therefore say "not ready" where SQL would
 * admit by a fraction of a cent, never the opposite. SQL remains the only authority for admission.
 */

/** Decimal string of a numeric value without exponent notation, or null if not a finite, non-negative number. */
function decimalString(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    // toFixed gives the shortest correctly rounded decimal expansion at that precision (no exponent).
    return value.toFixed(10);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d+(\.\d+)?$/.test(s)) return s;
    const n = Number(s);
    return s !== "" && Number.isFinite(n) && n >= 0 ? n.toFixed(10) : null;
  }
  return null;
}

/** Integer cents of a non-negative USD amount, rounded down ("floor") or up ("ceil"). Null when invalid. */
export function usdToCents(value: unknown, mode: "floor" | "ceil"): number | null {
  const s = decimalString(value);
  if (s === null) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  const remainder = /[1-9]/.test(frac.slice(2));
  const result = mode === "ceil" && remainder ? cents + 1 : cents;
  return Number.isSafeInteger(result) ? result : null;
}

export interface GateMoney {
  /** Budget left for new reservations, in cents (never negative). Null if a value is invalid. */
  availableCents: number | null;
  /** True only when every value is valid and at least one full reserve fits. Fails closed otherwise. */
  canReserve: boolean;
}

export function gateMoney(budget: unknown, committed: unknown, reserve: unknown): GateMoney {
  const b = usdToCents(budget, "floor");
  const c = usdToCents(committed, "ceil");
  const r = usdToCents(reserve, "ceil");
  if (b === null || c === null) return { availableCents: null, canReserve: false };
  const availableCents = Math.max(0, b - c);
  return { availableCents, canReserve: r !== null && r > 0 && availableCents >= r };
}

/** Cents → USD number for display (exact for 2-decimal amounts). */
export function centsToUsd(cents: number | null): number {
  return cents === null ? 0 : cents / 100;
}
