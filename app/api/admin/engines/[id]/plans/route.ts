import { NextResponse } from "next/server";
import { requireAdmin } from "../../../middleware";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_PLANS = ["free", "pro", "premium"];

/**
 * PUT /api/admin/engines/[id]/plans — Replace plans for an engine
 * Body: { plans: ["pro", "premium"] }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const plans = Array.isArray(body.plans) ? body.plans : [];

  // Validate
  const validPlans = plans.filter((p: string) => VALID_PLANS.includes(p));
  if (validPlans.length !== plans.length) {
    return NextResponse.json({ error: `Plans must be subset of ${VALID_PLANS.join(", ")}` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Atomic replace: delete all existing plans for this engine, then insert new ones
  const { error: deleteError } = await supabase.from("engine_plans").delete().eq("engine_id", id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (validPlans.length > 0) {
    const rows = validPlans.map((p: string) => ({ engine_id: id, plan: p }));
    const { error: insertError } = await supabase.from("engine_plans").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  console.log(`[admin] Engine plans updated: ${id} → [${validPlans.join(", ")}] by ${auth.user.email}`);
  return NextResponse.json({ success: true, plans: validPlans });
}
