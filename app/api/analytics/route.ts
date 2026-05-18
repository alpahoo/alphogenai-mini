import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * GET /api/analytics — User-facing analytics dashboard data.
 *
 * Returns generation history, engine breakdown, and usage stats
 * for the authenticated user.
 */
export async function GET() {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Run queries in parallel
  const [totalRes, doneRes, failedRes, last30Res] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("jobs")
      .select("engine_used, target_duration_seconds, estimated_cost_usd, created_at")
      .eq("user_id", user.id)
      .eq("status", "done"),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "failed"),
    supabase
      .from("jobs")
      .select("created_at, status")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const totalJobs = totalRes.count ?? 0;
  const failedJobs = failedRes.count ?? 0;
  const doneJobs = doneRes.data?.length ?? 0;

  // Engine breakdown
  const engineBreakdown: Record<string, { count: number; durationSec: number }> = {};
  let totalDurationSec = 0;

  for (const j of doneRes.data ?? []) {
    const engine = (j.engine_used as string) ?? "unknown";
    const dur = Number(j.target_duration_seconds) || 0;
    totalDurationSec += dur;
    if (!engineBreakdown[engine]) engineBreakdown[engine] = { count: 0, durationSec: 0 };
    engineBreakdown[engine].count++;
    engineBreakdown[engine].durationSec += dur;
  }

  // Daily chart (last 30 days)
  const dayMap = new Map<string, { total: number; done: number; failed: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayMap.set(d.toISOString().slice(0, 10), { total: 0, done: 0, failed: 0 });
  }
  for (const j of last30Res.data ?? []) {
    const day = j.created_at?.slice(0, 10);
    if (day && dayMap.has(day)) {
      const entry = dayMap.get(day)!;
      entry.total++;
      if (j.status === "done") entry.done++;
      if (j.status === "failed") entry.failed++;
    }
  }
  const dailyChart = Array.from(dayMap, ([date, stats]) => ({ date, ...stats }));

  const successRate = totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0;

  return NextResponse.json(
    {
      totalJobs,
      doneJobs,
      failedJobs,
      successRate,
      totalDurationSec,
      engineBreakdown,
      dailyChart,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
