import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    // Intentionally pinned to an older API version than the SDK default.
    // Upgrading Stripe API versions can change response shapes for
    // subscriptions / invoices and must be validated against the live
    // billing flow (cf. future-proof-notes.md §2.1 — do not modify Stripe
    // billing logic without explicit testing). When ready to upgrade,
    // change here AND replay a sample of webhook events in test mode.
    // @ts-expect-error — SDK v21 wants "2026-03-25.dahlia"; we keep the
    // older pinned version intentionally for production billing stability.
    _stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" });
  }
  return _stripe;
}
