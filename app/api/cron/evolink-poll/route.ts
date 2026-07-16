/**
 * GET /api/cron/evolink-poll
 *
 * Vercel Cron — runs every minute.
 * Server-side poller for ALL active jobs (EvoLink + Bailian).
 *
 * Instead of reimplementing the state machine, it simply calls
 * GET /api/jobs/[id] for each active job — the existing handler
 * advances scenes, cascades failures, triggers concat, etc.
 *
 * This ensures jobs progress even when the user closes the browser tab.
 *
 * Auth: Vercel calls this with Authorization: Bearer $CRON_SECRET.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { assertCronAuth } from "@/lib/cron-auth";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: Request) {
  // FAIL-CLOSED — refuse if CRON_SECRET is missing or incorrect, BEFORE creating
  // the service-role client (shared policy, see lib/cron-auth.ts).
  const denied = assertCronAuth(req);
  if (denied) return denied;

  const supabase = createServiceClient();

  // Find all active jobs
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, engine_used, current_stage, updated_at")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cron/poll] DB fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeJobs = jobs ?? [];

  if (activeJobs.length === 0) {
    return NextResponse.json({ polled: 0, message: "No active jobs" });
  }

  console.log(
    `[cron/poll] Found ${activeJobs.length} active job(s): ` +
    activeJobs.map((j) => `${j.id.slice(0, 8)}(${j.engine_used})`).join(", ")
  );

  // Determine base URL for self-calls
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    console.error("[cron/poll] No base URL configured (NEXT_PUBLIC_SITE_URL or VERCEL_URL)");
    return NextResponse.json({ error: "No base URL" }, { status: 500 });
  }

  let advanced = 0;
  let errors = 0;

  // Call GET /api/jobs/[id] for each — sequential to stay within maxDuration
  for (const job of activeJobs) {
    try {
      const res = await fetch(`${baseUrl}/api/jobs/${job.id}`, {
        method: "GET",
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(25_000), // 25s per job max
      });

      if (res.ok) {
        advanced++;
      } else {
        console.warn(`[cron/poll] job=${job.id.slice(0, 8)} responded ${res.status}`);
        errors++;
      }
    } catch (e) {
      console.warn(
        `[cron/poll] job=${job.id.slice(0, 8)} fetch error:`,
        e instanceof Error ? e.message : e
      );
      errors++;
    }
  }

  console.log(
    `[cron/poll] Done: ${advanced} advanced, ${errors} errors out of ${activeJobs.length}`
  );

  return NextResponse.json({
    polled: activeJobs.length,
    advanced,
    errors,
  });
}
