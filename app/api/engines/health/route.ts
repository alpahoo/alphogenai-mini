import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * GET /api/engines/health — Returns success rate per engine (last 24h).
 *
 * Response: Record<string, { total: number; succeeded: number; rate: number }>
 * rate is 0.0–1.0. Engines with fewer than 3 jobs return rate = -1 (unknown).
 *
 * Cached 5 min CDN, stale-while-revalidate 1h.
 */
export async function GET() {
  const supabase = createServiceClient();

  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString();

  // Fetch all recent jobs with their engine and status
  const { data: jobs } = await supabase
    .from("jobs")
    .select("engine_used, status")
    .gte("created_at", twentyFourHoursAgo)
    .not("engine_used", "is", null);

  const stats: Record<string, { total: number; succeeded: number }> = {};

  for (const row of jobs ?? []) {
    const engine = row.engine_used as string;
    if (!stats[engine]) stats[engine] = { total: 0, succeeded: 0 };
    stats[engine].total++;
    if (row.status === "done") stats[engine].succeeded++;
  }

  // Build response with rate
  const health: Record<string, { total: number; succeeded: number; rate: number }> = {};
  for (const [engine, s] of Object.entries(stats)) {
    health[engine] = {
      ...s,
      rate: s.total >= 3 ? Math.round((s.succeeded / s.total) * 100) / 100 : -1,
    };
  }

  return NextResponse.json(health, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}
