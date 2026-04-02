import { getStripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

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
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("Stripe webhook signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Handle checkout completion
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.userId;

    if (!userId) {
      console.error("Stripe webhook: no userId in metadata");
      return NextResponse.json({ error: "No userId" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ plan: "pro", updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to update profile plan:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    console.log(`[stripe] User ${userId} upgraded to pro`);
  }

  return NextResponse.json({ received: true });
}
