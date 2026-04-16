import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/engines — List all engines with plans + costs + secret names
 */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const supabase = createServiceClient();

  const [enginesRes, plansRes, costsRes, secretsRes] = await Promise.all([
    supabase.from("engines").select("*").order("priority", { ascending: false }),
    supabase.from("engine_plans").select("*"),
    supabase.from("engine_costs").select("*"),
    supabase.from("engine_secrets").select("engine_id, secret_name, updated_at"),
  ]);

  if (enginesRes.error) {
    return NextResponse.json({ error: enginesRes.error.message }, { status: 500 });
  }

  // Group plans by engine
  const plansByEngine = new Map<string, string[]>();
  for (const row of plansRes.data ?? []) {
    const arr = plansByEngine.get(row.engine_id) ?? [];
    arr.push(row.plan);
    plansByEngine.set(row.engine_id, arr);
  }

  // Map costs by engine
  const costByEngine = new Map<string, (typeof costsRes.data)[0] | null>();
  for (const row of costsRes.data ?? []) {
    costByEngine.set(row.engine_id, row);
  }

  // Map secret names by engine
  const secretsByEngine = new Map<string, { name: string; updated_at: string }[]>();
  for (const row of secretsRes.data ?? []) {
    const arr = secretsByEngine.get(row.engine_id) ?? [];
    arr.push({ name: row.secret_name, updated_at: row.updated_at });
    secretsByEngine.set(row.engine_id, arr);
  }

  const engines = (enginesRes.data ?? []).map((e) => ({
    ...e,
    plans: plansByEngine.get(e.id) ?? [],
    cost: costByEngine.get(e.id) ?? null,
    secrets: secretsByEngine.get(e.id) ?? [],
  }));

  return NextResponse.json({ engines });
}

/**
 * POST /api/admin/engines — Create a new engine
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await req.json();
  const { id, name, type, status, max_duration, gpu, clip_duration, priority, plans, cost } = body;

  // Validation
  if (!id || !name || !type || !max_duration) {
    return NextResponse.json({ error: "Missing required fields: id, name, type, max_duration" }, { status: 400 });
  }
  if (!["api", "modal_local"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Insert engine
  const { error: engineError } = await supabase.from("engines").insert({
    id,
    name,
    type,
    status: status ?? "coming_soon",
    max_duration,
    gpu: gpu ?? null,
    clip_duration: clip_duration ?? null,
    priority: priority ?? 100,
  });

  if (engineError) {
    return NextResponse.json({ error: engineError.message }, { status: 500 });
  }

  // Insert plans
  if (Array.isArray(plans) && plans.length > 0) {
    const planRows = plans
      .filter((p: string) => ["free", "pro", "premium"].includes(p))
      .map((p: string) => ({ engine_id: id, plan: p }));
    if (planRows.length > 0) {
      await supabase.from("engine_plans").insert(planRows);
    }
  }

  // Insert cost
  if (cost && cost.billing_model) {
    await supabase.from("engine_costs").insert({
      engine_id: id,
      billing_model: cost.billing_model,
      per_second_usd: cost.per_second_usd ?? null,
      per_video_usd: cost.per_video_usd ?? null,
    });
  }

  console.log(`[admin] Engine created: ${id} by ${auth.user.email}`);
  return NextResponse.json({ success: true, id }, { status: 201 });
}
