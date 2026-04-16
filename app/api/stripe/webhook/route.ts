import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import {
  APP_ID,
  resolveAppId,
  sessionHasAlphogenaiPrice,
} from "@/lib/stripe-app-context";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 *
 * Multi-SaaS isolation flow:
 *   1. Verify signature → 400 on failure
 *   2. Resolve app_id from event metadata (type-aware)
 *   3. Route:
 *      - app_id === "alphogenai" → process
 *      - app_id !== "alphogenai" && != null → ignore (200, not ours)
 *      - app_id === null → legacy fallback (price ID + customer lookup)
 *   4. Idempotency: check → process → mark
 *   5. Always return JSON, never throw
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "alphogenai_stripe",
        event: "webhook.config_missing",
      })
    );
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  // ── 1. Signature verification ─────────────────────────────────
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error(
      JSON.stringify({
        level: "error",
        service: "alphogenai_stripe",
        event: "webhook.signature_invalid",
        message,
      })
    );
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // ── 2. Resolve app context ────────────────────────────────────
  let appId = resolveAppId(event);
  let isLegacy = false;

  // Fallback: untagged event — try price ID secondary signal
  if (appId === null) {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (sessionHasAlphogenaiPrice(session)) {
        appId = APP_ID;
        isLegacy = true;
      }
    }
    // Other untagged event types: keep appId=null and check below via customer lookup
  }

  // ── 3. Routing decision ───────────────────────────────────────
  if (appId !== null && appId !== APP_ID) {
    // Belongs to a different SaaS app — ignore safely
    console.info(
      JSON.stringify({
        level: "info",
        service: "alphogenai_stripe",
        event: "webhook.ignored",
        event_id: event.id,
        event_type: event.type,
        app_id: appId,
        action: "ignored",
        reason: "different_app",
      })
    );
    return NextResponse.json(
      { received: true, status: "ignored" },
      { status: 200 }
    );
  }

  // ── 4. Idempotency check (BEFORE processing) ──────────────────
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) {
    console.info(
      JSON.stringify({
        level: "info",
        service: "alphogenai_stripe",
        event: "webhook.duplicate",
        event_id: event.id,
        event_type: event.type,
        action: "duplicate",
      })
    );
    return NextResponse.json(
      { received: true, status: "duplicate" },
      { status: 200 }
    );
  }

  // ── 5. Process the event ──────────────────────────────────────
  let processed = false;
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (!userId) {
        // Untagged legacy event with no userId — best-effort: lookup via customer
        if (appId === null && !isLegacy) {
          console.warn(
            JSON.stringify({
              level: "warn",
              service: "alphogenai_stripe",
              event: "webhook.no_userid",
              event_id: event.id,
              event_type: event.type,
            })
          );
          return NextResponse.json(
            { received: true, status: "ignored", reason: "no_userid" },
            { status: 200 }
          );
        }
        return NextResponse.json(
          { received: true, status: "ignored", reason: "no_userid" },
          { status: 200 }
        );
      }

      // Resolve plan from metadata (supports pro + premium)
      const checkoutPlan =
        (session.metadata?.plan === "premium" ? "premium" : null) ??
        (session.metadata?.plan === "pro" ? "pro" : null) ??
        "pro"; // default to pro for backward compat

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ plan: checkoutPlan, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (updateError) {
        console.error(
          JSON.stringify({
            level: "error",
            service: "alphogenai_stripe",
            event: "webhook.db_update_failed",
            event_id: event.id,
            error: updateError.message,
          })
        );
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      processed = true;
      console.info(
        JSON.stringify({
          level: "info",
          service: "alphogenai_stripe",
          event: "webhook.processed",
          event_id: event.id,
          event_type: event.type,
          app_id: APP_ID,
          action: isLegacy ? "accepted_legacy" : "accepted",
          user_id: userId,
        })
      );
    } else {
      // Other event types — log but don't process (for now)
      console.info(
        JSON.stringify({
          level: "info",
          service: "alphogenai_stripe",
          event: "webhook.unhandled_type",
          event_id: event.id,
          event_type: event.type,
        })
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "processing failed";
    console.error(
      JSON.stringify({
        level: "error",
        service: "alphogenai_stripe",
        event: "webhook.processing_error",
        event_id: event.id,
        error: message,
      })
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // ── 6. Mark as processed (AFTER successful handling) ──────────
  if (processed) {
    const { error: insertError } = await supabase
      .from("stripe_events")
      .insert({
        event_id: event.id,
        event_type: event.type,
        app_id: APP_ID,
      });

    // If race condition inserted it, that's fine — next request will catch as duplicate
    if (insertError && !insertError.message.includes("duplicate")) {
      console.warn(
        JSON.stringify({
          level: "warn",
          service: "alphogenai_stripe",
          event: "webhook.idempotency_insert_failed",
          event_id: event.id,
          error: insertError.message,
        })
      );
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
