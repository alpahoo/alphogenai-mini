import { NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/engines/[id] — Engine detail with plans + cost + secret names
 */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const supabase = createServiceClient();

  const [engineRes, plansRes, costRes, secretsRes] = await Promise.all([
    supabase.from("engines").select("*").eq("id", id).single(),
    supabase.from("engine_plans").select("plan").eq("engine_id", id),
    supabase.from("engine_costs").select("*").eq("engine_id", id).maybeSingle(),
    supabase.from("engine_secrets").select("secret_name, updated_at").eq("engine_id", id),
  ]);

  if (engineRes.error) {
    return NextResponse.json({ error: "Engine not found" }, { status: 404 });
  }

  return NextResponse.json({
    engine: {
      ...engineRes.data,
      plans: (plansRes.data ?? []).map((p) => p.plan),
      cost: costRes.data ?? null,
      secrets: (secretsRes.data ?? []).map((s) => ({
        name: s.secret_name,
        updated_at: s.updated_at,
      })),
    },
  });
}

/**
 * PATCH /api/admin/engines/[id] — Update engine config
 */
export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();

  // Whitelist updatable fields
  const allowed = ["name", "type", "status", "max_duration", "gpu", "clip_duration", "priority", "api_config"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("engines").update(updates).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[admin] Engine updated: ${id} by ${auth.user.email}`);
  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/admin/engines/[id] — Soft-delete (set status=deprecated)
 */
export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("engines")
    .update({ status: "deprecated", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[admin] Engine deprecated: ${id} by ${auth.user.email}`);
  return NextResponse.json({ success: true });
}
