/**
 * C2b: per-admin request and spending limits, in memory.
 *
 * BEST EFFORT ONLY: serverless instances do not share memory and restart often, so this bounds bursts on
 * one instance, not the monthly bill. The durable cap is the provider's own key/workspace spending limit,
 * which must be set before the assistant is enabled (see the activation checklist in the phase C doc).
 * A persisted ledger would need a migration; it is deliberately not part of this PR.
 */
import { ASSISTANT_LIMITS, type AssistantLimits } from "./limits";

interface Window { requests: number[]; spent: { day: string; usd: number } }

export class AssistantRateLimiter {
  private readonly users = new Map<string, Window>();
  constructor(private readonly limits: AssistantLimits = ASSISTANT_LIMITS, private readonly now: () => number = Date.now) {}

  private window(userId: string): Window {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    let w = this.users.get(userId);
    if (!w) { w = { requests: [], spent: { day, usd: 0 } }; this.users.set(userId, w); }
    if (w.spent.day !== day) w.spent = { day, usd: 0 };
    const hourAgo = this.now() - 3_600_000;
    w.requests = w.requests.filter(t => t > hourAgo);
    return w;
  }

  /** Reserve one request. Returns the remaining daily USD allowance, or a refusal. */
  acquire(userId: string): { ok: true; remainingUsd: number } | { ok: false; reason: "rate" | "daily_budget" } {
    const w = this.window(userId);
    if (w.requests.length >= this.limits.maxRequestsPerHour) return { ok: false, reason: "rate" };
    const remainingUsd = this.limits.maxUsdPerDay - w.spent.usd;
    if (remainingUsd <= 0) return { ok: false, reason: "daily_budget" };
    w.requests.push(this.now());
    return { ok: true, remainingUsd };
  }

  /** Record the actual cost of a finished request. */
  record(userId: string, usd: number): void {
    if (Number.isFinite(usd) && usd > 0) this.window(userId).spent.usd += usd;
  }
}

/** One limiter per server instance. */
export const assistantRateLimiter = new AssistantRateLimiter();
