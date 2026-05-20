import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/analytics — Enriched user-facing analytics.
 *
 * Query params:
 *   ?days=7|30|90  (default 30)
 *
 * Returns generation stats, publishing metrics, engine & plan breakdown,
 * audio usage, daily chart, and recent activity.
 */
export async function GET(req: NextRequest) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = req.nextUrl.searchParams.get("days");
  const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createServiceClient();

  // ── Run all queries in parallel ──────────────────────────────────────────
  const [
    totalRes,
    doneAllRes,
    failedRes,
    inProgressRes,
    periodJobsRes,
    scheduledPostsRes,
  ] = await Promise.all([
    // Total jobs (all time)
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),

    // All done jobs (for engine/plan/audio breakdown)
    supabase
      .from("jobs")
      .select(
        "engine_used, target_duration_seconds, plan, audio_mode, voiceover_text, created_at"
      )
      .eq("user_id", user.id)
      .eq("status", "done"),

    // Failed count
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "failed"),

    // In-progress count
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "in_progress"),

    // Jobs in period (for daily chart)
    supabase
      .from("jobs")
      .select("created_at, status")
      .eq("user_id", user.id)
      .gte("created_at", since),

    // All scheduled posts (for publishing stats)
    supabase
      .from("scheduled_posts")
      .select("platforms, status, scheduled_at, published_at, publish_results")
      .eq("user_id", user.id),
  ]);

  // ── Generation KPIs ──────────────────────────────────────────────────────
  const totalJobs = totalRes.count ?? 0;
  const failedJobs = failedRes.count ?? 0;
  const inProgressJobs = inProgressRes.count ?? 0;
  const doneAll = doneAllRes.data ?? [];
  const doneJobs = doneAll.length;
  const successRate =
    totalJobs > 0 ? Math.round((doneJobs / totalJobs) * 100) : 0;

  // ── Engine breakdown ─────────────────────────────────────────────────────
  const engineBreakdown: Record<
    string,
    { count: number; durationSec: number }
  > = {};
  let totalDurationSec = 0;

  for (const j of doneAll) {
    const engine = (j.engine_used as string) ?? "unknown";
    const dur = Number(j.target_duration_seconds) || 0;
    totalDurationSec += dur;
    if (!engineBreakdown[engine])
      engineBreakdown[engine] = { count: 0, durationSec: 0 };
    engineBreakdown[engine].count++;
    engineBreakdown[engine].durationSec += dur;
  }

  // ── Plan breakdown ───────────────────────────────────────────────────────
  const planBreakdown: Record<string, number> = { free: 0, pro: 0, premium: 0 };
  for (const j of doneAll) {
    const plan = (j.plan as string) ?? "free";
    planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
  }

  // ── Audio stats ──────────────────────────────────────────────────────────
  let withAudio = 0;
  let withVoiceover = 0;
  for (const j of doneAll) {
    if (j.audio_mode && j.audio_mode !== "none") withAudio++;
    if (j.voiceover_text) withVoiceover++;
  }
  const audioStats = { withAudio, withVoiceover, total: doneJobs };

  // ── Publishing stats ─────────────────────────────────────────────────────
  const posts = scheduledPostsRes.data ?? [];
  const publishStats = {
    totalScheduled: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    failed: posts.filter((p) => p.status === "failed").length,
    partiallyPublished: posts.filter(
      (p) => p.status === "partially_published"
    ).length,
    pending: posts.filter(
      (p) => p.status === "scheduled" || p.status === "publishing"
    ).length,
  };
  const publishRate = publishStats.totalScheduled > 0
    ? Math.round(
        (publishStats.published / publishStats.totalScheduled) * 100
      )
    : 0;

  // Platform breakdown
  const platformBreakdown: Record<
    string,
    { scheduled: number; published: number; failed: number }
  > = {};
  for (const p of posts) {
    const platforms = (p.platforms as string[]) ?? [];
    const results = (p.publish_results ?? {}) as Record<
      string,
      { success?: boolean }
    >;
    for (const plat of platforms) {
      if (!platformBreakdown[plat])
        platformBreakdown[plat] = { scheduled: 0, published: 0, failed: 0 };
      platformBreakdown[plat].scheduled++;
      const result = results[plat];
      if (result?.success) platformBreakdown[plat].published++;
      else if (
        p.status === "failed" ||
        p.status === "partially_published"
      )
        platformBreakdown[plat].failed++;
    }
  }

  // ── Daily chart ──────────────────────────────────────────────────────────
  const dayMap = new Map<
    string,
    { generated: number; done: number; failed: number; published: number }
  >();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayMap.set(d.toISOString().slice(0, 10), {
      generated: 0,
      done: 0,
      failed: 0,
      published: 0,
    });
  }

  for (const j of periodJobsRes.data ?? []) {
    const day = j.created_at?.slice(0, 10);
    if (day && dayMap.has(day)) {
      const entry = dayMap.get(day)!;
      entry.generated++;
      if (j.status === "done") entry.done++;
      if (j.status === "failed") entry.failed++;
    }
  }

  // Overlay publish dates
  for (const p of posts) {
    const day = p.published_at?.slice(0, 10) ?? p.scheduled_at?.slice(0, 10);
    if (
      day &&
      dayMap.has(day) &&
      (p.status === "published" || p.status === "partially_published")
    ) {
      dayMap.get(day)!.published++;
    }
  }

  const dailyChart = Array.from(dayMap, ([date, stats]) => ({
    date,
    ...stats,
  }));

  // ── Recent activity (last 8 jobs) ────────────────────────────────────────
  const { data: recentRaw } = await supabase
    .from("jobs")
    .select("id, prompt, status, engine_used, plan, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const recentJobs = (recentRaw ?? []).map((j) => ({
    id: j.id as string,
    prompt: ((j.prompt as string) ?? "").slice(0, 80),
    status: j.status as string,
    engine: j.engine_used as string | null,
    plan: j.plan as string | null,
    created_at: j.created_at as string,
  }));

  return NextResponse.json(
    {
      days,
      // Generation
      totalJobs,
      doneJobs,
      failedJobs,
      inProgressJobs,
      successRate,
      totalDurationSec,
      // Breakdowns
      engineBreakdown,
      planBreakdown,
      audioStats,
      // Publishing
      publishStats,
      publishRate,
      platformBreakdown,
      // Charts
      dailyChart,
      // Activity
      recentJobs,
    },
    {
      headers: { "Cache-Control": "private, max-age=60" },
    }
  );
}
