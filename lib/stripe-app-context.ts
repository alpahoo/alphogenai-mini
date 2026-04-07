/**
 * Stripe multi-SaaS isolation layer.
 *
 * Tags every new Stripe object with AlphoGenAI app context, and provides
 * a type-aware resolver to identify which app a webhook event belongs to.
 *
 * Strategy:
 *   1. Inject metadata.app_id on all NEW objects (customers, sessions)
 *   2. On webhook receive, resolve app_id from event.data.object metadata
 *   3. Fall back to known price IDs as a secondary signal
 *   4. Untagged events linked to known customers are processed (legacy)
 *   5. Events for OTHER apps are ignored (returns 200, not processed)
 */
import type Stripe from "stripe";

// ---------------------------------------------------------------------------
// App identity
// ---------------------------------------------------------------------------
export const APP_ID = "alphogenai" as const;

export const APP_METADATA: Record<string, string> = {
  app_id: APP_ID,
  service_name: APP_ID,
  environment: process.env.STRIPE_ENV || "live",
};

// Known AlphoGenAI price IDs (secondary routing signal)
export const ALPHOGENAI_PRICE_IDS: Set<string> = new Set(
  [process.env.STRIPE_PRICE_ID].filter((v): v is string => Boolean(v))
);

// ---------------------------------------------------------------------------
// Conservative metadata merge
// ---------------------------------------------------------------------------
/**
 * Merge AlphoGenAI metadata into an existing metadata object.
 * Preserves existing keys — only sets app keys when absent or matching.
 */
export function mergeAppMetadata(
  existing?: Record<string, string> | null
): Record<string, string> {
  const merged: Record<string, string> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(APP_METADATA)) {
    if (!(key in merged) || merged[key] === value) {
      merged[key] = value;
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// App context resolver (type-aware)
// ---------------------------------------------------------------------------
/**
 * Resolve which app a Stripe event belongs to.
 *
 * Returns:
 *   - "alphogenai"  → process normally
 *   - some_other_id → ignore (return 200, not ours)
 *   - null          → legacy event (no metadata) — caller decides via fallback
 */
export function resolveAppId(event: Stripe.Event): string | null {
  const obj = event.data.object as Record<string, unknown>;

  // Priority 1: direct metadata on the event object
  const directMeta = (obj.metadata ?? null) as Record<string, string> | null;
  if (directMeta?.app_id) return directMeta.app_id;

  // Priority 2: nested object metadata (subscription, customer)
  // Only inspect if Stripe expanded the object (rare in webhook payloads)
  const sub = obj.subscription;
  if (sub && typeof sub === "object" && sub !== null) {
    const subMeta = (sub as { metadata?: Record<string, string> }).metadata;
    if (subMeta?.app_id) return subMeta.app_id;
  }

  const customer = obj.customer;
  if (customer && typeof customer === "object" && customer !== null) {
    const custMeta = (customer as { metadata?: Record<string, string> })
      .metadata;
    if (custMeta?.app_id) return custMeta.app_id;
  }

  // No metadata → caller must apply fallback (price ID, customer lookup, etc.)
  return null;
}

// ---------------------------------------------------------------------------
// Secondary signal: price ID detection
// ---------------------------------------------------------------------------
/**
 * Check if a checkout session's line items reference an AlphoGenAI price ID.
 * Used as a fallback when metadata is missing on legacy events.
 */
export function sessionHasAlphogenaiPrice(
  session: Stripe.Checkout.Session
): boolean {
  const items = session.line_items?.data ?? [];
  for (const item of items) {
    const priceId = item.price?.id;
    if (priceId && ALPHOGENAI_PRICE_IDS.has(priceId)) {
      return true;
    }
  }
  return false;
}
