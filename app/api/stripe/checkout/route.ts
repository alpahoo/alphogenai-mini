import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { mergeAppMetadata } from "@/lib/stripe-app-context";
import { NextResponse } from "next/server";

/** Map plan name to env var holding the Stripe Price ID. */
const PLAN_PRICE_ENV: Record<string, string> = {
  pro: "STRIPE_PRICE_ID",
  premium: "STRIPE_PREMIUM_PRICE_ID",
};

export async function POST(req: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id || !user.email) {
      return NextResponse.json(
        { error: "You must be logged in to upgrade." },
        { status: 401 }
      );
    }

    // Parse requested plan (default: pro for backward compat)
    let requestedPlan = "pro";
    try {
      const body = await req.json();
      if (body.plan === "pro" || body.plan === "premium") {
        requestedPlan = body.plan;
      }
    } catch {
      // No body or invalid JSON — default to pro
    }

    const supabase = createServiceClient();

    // Get current profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, plan")
      .eq("id", user.id)
      .single();

    // Block if already on same or higher plan
    if (profile?.plan === requestedPlan) {
      return NextResponse.json(
        { error: `You are already on the ${requestedPlan} plan.` },
        { status: 400 }
      );
    }
    if (profile?.plan === "premium" && requestedPlan === "pro") {
      return NextResponse.json(
        { error: "You are already on Premium which includes all Pro features." },
        { status: 400 }
      );
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email,
        metadata: mergeAppMetadata({ userId: user.id }),
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Resolve Stripe Price ID
    const envKey = PLAN_PRICE_ENV[requestedPlan];
    const priceId = envKey ? process.env[envKey] : undefined;
    if (!priceId) {
      return NextResponse.json(
        { error: `Stripe not configured for ${requestedPlan} plan` },
        { status: 500 }
      );
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/create?upgraded=true`,
      cancel_url: `${siteUrl}/pricing`,
      metadata: mergeAppMetadata({ userId: user.id, plan: requestedPlan }),
      subscription_data: {
        metadata: mergeAppMetadata({ userId: user.id, plan: requestedPlan }),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    console.error("POST /api/stripe/checkout error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
