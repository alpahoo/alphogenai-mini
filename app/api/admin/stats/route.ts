import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const supabase = createServiceClient();

    // Run all queries in parallel — no RPCs, direct queries only
    const [profilesRes, jobsRes, costRes, engineDistRes, last7DaysRes] =
      await Promise.all([
        // Total users
        supabase.from("profiles").select("*", { count: "exact", head: true }),

        // Total jobs
        supabase.from("jobs").select("*", { count: "exact", head: true }),

        // Done jobs with cost
        supabase
          .from("jobs")
          .select("estimated_cost_usd")
          .eq("status", "done")
          .not("estimated_cost_usd", "is", null),

        // Done jobs with engine
        supabase
          .from("jobs")
          .select("engine_used, estimated_cost_usd")
          .eq("status", "done")
          .not("engine_used", "is", null),

        // Jobs last 7 days
        supabase
          .from("jobs")
          .select("created_at")
          .gte(
            "created_at",
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          ),
      ]);

    // Plan distribution — separate query
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("plan");
    const planDistribution: Record<string, number> = {};
    for (const p of allProfiles ?? []) {
      planDistribution[p.plan] = (planDistribution[p.plan] ?? 0) + 1;
    }

    const totalUsers = profilesRes.count ?? 0;
    const totalJobs = jobsRes.count ?? 0;

    // Total cost
    const totalCostUsd = (costRes.data ?? []).reduce(
      (sum: number, j: { estimated_cost_usd: string | number | null }) =>
        sum + (Number(j.estimated_cost_usd) || 0),
      0
    );

    // Engine distribution
    const engineMap = new Map<string, { count: number; cost: number }>();
    for (const j of engineDistRes.data ?? []) {
      const key = j.engine_used ?? "unknown";
      const prev = engineMap.get(key) ?? { count: 0, cost: 0 };
      engineMap.set(key, {
        count: prev.count + 1,
        cost: prev.cost + (Number(j.estimated_cost_usd) || 0),
      });
    }
    const costByEngine = Object.fromEntries(engineMap);

    // Jobs last 7 days — group by date
    const dayMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const j of last7DaysRes.data ?? []) {
      const day = j.created_at?.slice(0, 10);
      if (day && dayMap.has(day)) {
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
    }
    const jobsLast7Days = Array.from(dayMap, ([date, count]) => ({
      date,
      count,
    }));

    return NextResponse.json({
      totalUsers,
      totalJobs,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      costByEngine,
      jobsLast7Days,
      planDistribution,
    });
  } catch (error) {
    console.error("[admin/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
