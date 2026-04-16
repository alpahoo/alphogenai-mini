import { NextResponse } from "next/server";
import { requireAdmin } from "../../../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * PUT /api/admin/engines/[id]/costs — Upsert cost config
 * Body: { billing_model: "per_second", per_second_usd: 0.025 }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const { billing_model, per_second_usd, per_video_usd } = body;

  if (!["per_second", "per_video"].includes(billing_model)) {
    return NextResponse.json({ error: "billing_model must be 'per_second' or 'per_video'" }, { status: 400 });
  }

  if (billing_model === "per_second" && typeof per_second_usd !== "number") {
    return NextResponse.json({ error: "per_second_usd required for per_second billing" }, { status: 400 });
  }

  if (billing_model === "per_video" && typeof per_video_usd !== "number") {
    return NextResponse.json({ error: "per_video_usd required for per_video billing" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase.from("engine_costs").upsert(
    {
      engine_id: id,
      billing_model,
      per_second_usd: billing_model === "per_second" ? per_second_usd : null,
      per_video_usd: billing_model === "per_video" ? per_video_usd : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "engine_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[admin] Engine cost updated: ${id} by ${auth.user.email}`);
  return NextResponse.json({ success: true });
}
