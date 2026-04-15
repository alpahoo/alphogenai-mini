import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/jobs — Paginated list of all jobs
 * Query params: ?status=done&engine=seedance&page=1&limit=20
 */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const engine = url.searchParams.get("engine");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  // Build query
  let query = supabase
    .from("jobs")
    .select(
      "id, user_id, prompt, status, plan, engine_used, estimated_cost_usd, current_stage, target_duration_seconds, created_at, updated_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (engine) query = query.eq("engine_used", engine);

  const { data: jobs, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get user emails for all user_ids in results
  const userIds = [...new Set((jobs ?? []).map((j) => j.user_id).filter(Boolean))];
  const emailMap = new Map<string, string>();

  if (userIds.length > 0) {
    const {
      data: { users: authUsers },
    } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    for (const u of authUsers ?? []) {
      if (userIds.includes(u.id)) {
        emailMap.set(u.id, u.email ?? "unknown");
      }
    }
  }

  const enrichedJobs = (jobs ?? []).map((j) => ({
    ...j,
    user_email: j.user_id ? emailMap.get(j.user_id) ?? "unknown" : "anonymous",
    prompt_short: j.prompt.length > 60 ? j.prompt.slice(0, 60) + "..." : j.prompt,
  }));

  return NextResponse.json({
    jobs: enrichedJobs,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}
