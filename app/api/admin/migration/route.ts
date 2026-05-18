import { NextResponse } from "next/server";
import { requireAdmin } from "../middleware";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/admin/migration — Migration dashboard metrics.
 *
 * Compares Bailian vs EvoLink performance over the last 7 days:
 * - Success rate per provider
 * - Average generation time (estimated from created_at → updated_at)
 * - Volume (job count)
 * - Cost comparison
 */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const supabase = createServiceClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all recent jobs with relevant fields
    const { data: jobs } = await supabase
      .from("jobs")
      .select("engine_used, status, estimated_cost_usd, created_at, updated_at")
      .gte("created_at", sevenDaysAgo)
      .not("engine_used", "is", null);

    // Categorize engines into providers
    const bailianEngines = new Set(["wan_26_bailian"]);
    const evolinkEngines = new Set([
      "evolink", "evolink_fast", "wan_26", "wan_27",
      "kling_o3", "kling_v3", "hailuo", "hailuo_fast",
      "happy_horse_10", "sora_2",
    ]);

    interface ProviderStats {
      total: number;
      done: number;
      failed: number;
      cost: number;
      totalLatencySec: number;
    }

    const providers: Record<string, ProviderStats> = {
      bailian: { total: 0, done: 0, failed: 0, cost: 0, totalLatencySec: 0 },
      evolink: { total: 0, done: 0, failed: 0, cost: 0, totalLatencySec: 0 },
      modal: { total: 0, done: 0, failed: 0, cost: 0, totalLatencySec: 0 },
    };

    for (const job of jobs ?? []) {
      const engine = job.engine_used as string;
      let provider: string;
      if (bailianEngines.has(engine)) provider = "bailian";
      else if (evolinkEngines.has(engine)) provider = "evolink";
      else provider = "modal";

      const stats = providers[provider];
      stats.total++;
      if (job.status === "done") stats.done++;
      if (job.status === "failed") stats.failed++;
      stats.cost += Number(job.estimated_cost_usd) || 0;

      // Estimate latency from timestamps
      if (job.created_at && job.updated_at) {
        const latency = (new Date(job.updated_at).getTime() - new Date(job.created_at).getTime()) / 1000;
        if (latency > 0 && latency < 3600) stats.totalLatencySec += latency;
      }
    }

    // Build response
    const result: Record<string, {
      total: number;
      successRate: number;
      avgLatencySec: number;
      totalCost: number;
      avgCostPerJob: number;
    }> = {};

    for (const [name, stats] of Object.entries(providers)) {
      if (stats.total === 0) continue;
      result[name] = {
        total: stats.total,
        successRate: Math.round((stats.done / stats.total) * 100),
        avgLatencySec: stats.done > 0 ? Math.round(stats.totalLatencySec / stats.done) : 0,
        totalCost: Math.round(stats.cost * 10000) / 10000,
        avgCostPerJob: stats.done > 0 ? Math.round((stats.cost / stats.done) * 10000) / 10000 : 0,
      };
    }

    // Current traffic split config
    const currentPct = parseInt(process.env.BAILIAN_TRAFFIC_PCT ?? "0", 10);
    const bailianConfigured = !!process.env.DASHSCOPE_API_KEY;

    return NextResponse.json({
      providers: result,
      config: {
        bailianTrafficPct: isNaN(currentPct) ? 0 : currentPct,
        bailianConfigured,
        mappedEngines: { wan_26: "wan_26_bailian" },
      },
      period: "7d",
    });
  } catch (error) {
    console.error("[admin/migration] Error:", error);
    return NextResponse.json({ error: "Failed to load migration data" }, { status: 500 });
  }
}
