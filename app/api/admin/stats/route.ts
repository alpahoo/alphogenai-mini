import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const supabase = createServiceClient();

    // Run queries in parallel
    const [
      profilesRes,
      jobsRes,
      doneJobsRes,
      failedJobsRes,
      last7DaysRes,
      last30DaysRes,
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("jobs").select("*", { count: "exact", head: true }),
      // All done jobs with engine, cost, plan for aggregation
      supabase
        .from("jobs")
        .select("engine_used, estimated_cost_usd, plan, created_at, target_duration_seconds")
        .eq("status", "done"),
      // Failed jobs count
      supabase
        .from("jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "failed"),
      // Last 7 days for daily chart
      supabase
        .from("jobs")
        .select("created_at")
        .gte(
          "created_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
      // Last 30 days with cost for cost trends
      supabase
        .from("jobs")
        .select("created_at, estimated_cost_usd, engine_used")
        .eq("status", "done")
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

    // Plan distribution
    const { data: allProfiles } = await supabase.from("profiles").select("plan");
    const planDistribution: Record<string, number> = {};
    for (const p of allProfiles ?? []) {
      planDistribution[p.plan] = (planDistribution[p.plan] ?? 0) + 1;
    }

    const totalUsers = profilesRes.count ?? 0;
    const totalJobs = jobsRes.count ?? 0;
    const failedJobs = failedJobsRes.count ?? 0;
    const doneJobs = (doneJobsRes.data ?? []).length;

    // Aggregate cost, engine, plan breakdowns
    let totalCostUsd = 0;
    const engineStats: Record<string, { count: number; cost: number; totalDurationSec: number }> = {};
    const planCostStats: Record<string, { count: number; cost: number }> = {};

    for (const j of doneJobsRes.data ?? []) {
      const cost = Number(j.estimated_cost_usd) || 0;
      const duration = Number(j.target_duration_seconds) || 0;
      totalCostUsd += cost;

      const engine = j.engine_used ?? "unknown";
      if (!engineStats[engine]) {
        engineStats[engine] = { count: 0, cost: 0, totalDurationSec: 0 };
      }
      engineStats[engine].count += 1;
      engineStats[engine].cost += cost;
      engineStats[engine].totalDurationSec += duration;

      const plan = j.plan ?? "unknown";
      if (!planCostStats[plan]) planCostStats[plan] = { count: 0, cost: 0 };
      planCostStats[plan].count += 1;
      planCostStats[plan].cost += cost;
    }

    // Round cost values
    for (const k of Object.keys(engineStats)) {
      engineStats[k].cost = Math.round(engineStats[k].cost * 10000) / 10000;
    }
    for (const k of Object.keys(planCostStats)) {
      planCostStats[k].cost = Math.round(planCostStats[k].cost * 10000) / 10000;
    }

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

    // Cost trends last 30 days
    const costDayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      costDayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const j of last30DaysRes.data ?? []) {
      const day = j.created_at?.slice(0, 10);
      if (day && costDayMap.has(day)) {
        const cost = Number(j.estimated_cost_usd) || 0;
        costDayMap.set(day, (costDayMap.get(day) ?? 0) + cost);
      }
    }
    const costLast30Days = Array.from(costDayMap, ([date, cost]) => ({
      date,
      cost: Math.round(cost * 10000) / 10000,
    }));

    // Success rate
    const successRate = totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0;

    // Avg cost per job
    const avgCostPerJob = doneJobs > 0 ? Math.round((totalCostUsd / doneJobs) * 10000) / 10000 : 0;

    return NextResponse.json({
      // Core metrics
      totalUsers,
      totalJobs,
      doneJobs,
      failedJobs,
      successRate,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      avgCostPerJob,
      // Breakdowns
      engineStats,       // { wan_i2v: { count, cost, totalDurationSec }, seedance: ... }
      planCostStats,     // { free: { count, cost }, pro: ..., premium: ... }
      planDistribution,  // { free: 5, pro: 2, ... }
      // Charts
      jobsLast7Days,
      costLast30Days,
      // Backward compat (dashboard uses costByEngine)
      costByEngine: Object.fromEntries(
        Object.entries(engineStats).map(([k, v]) => [k, { count: v.count, cost: v.cost }])
      ),
    });
  } catch (error) {
    console.error("[admin/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 }
    );
  }
}
