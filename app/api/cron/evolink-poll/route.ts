/**
 * GET /api/cron/evolink-poll
 *
 * Vercel Cron — runs every 2 minutes.
 * Polls all active EvoLink jobs server-side, independent of the frontend.
 *
 * Why needed: our EvoLink status detection in GET /api/jobs/[id] is
 * frontend-driven (poll every 5 s). If the user closes the tab, nobody
 * checks the task and the watchdog kills the job after 30 min.
 * This cron is the server-side safety net.
 *
 * Auth: Vercel calls this with Authorization: Bearer $CRON_SECRET.
 * We validate that header so random visitors can't trigger it.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isEvoLinkEngine, getEvoLinkTask } from "@/lib/evolink-client";

export const maxDuration = 60;

export async function GET(req: Request) {
  // Validate cron secret (Vercel injects Authorization: Bearer $CRON_SECRET)
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Fetch all active EvoLink jobs (have external_task_id + still in_progress)
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, external_task_id, engine_used, status")
    .in("status", ["pending", "in_progress"])
    .not("external_task_id", "is", null);

  if (error) {
    console.error("[cron/evolink-poll] DB fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeJobs = (jobs ?? []).filter(
    (j) => j.external_task_id && isEvoLinkEngine(j.engine_used ?? "")
  );

  if (activeJobs.length === 0) {
    return NextResponse.json({ polled: 0, message: "No active EvoLink jobs" });
  }

  console.log(`[cron/evolink-poll] Polling ${activeJobs.length} active EvoLink job(s)`);

  let completed = 0;
  let failed = 0;
  let processing = 0;

  // Poll each job — sequential to avoid hammering EvoLink
  for (const job of activeJobs) {
    try {
      const result = await getEvoLinkTask(job.external_task_id!);

      if (result.status === "completed" && result.videoUrl) {
        // Atomic update: only update if still in_progress (race-safe)
        const { error: upErr } = await supabase
          .from("jobs")
          .update({
            status: "done",
            current_stage: "completed",
            video_url: result.videoUrl,
            output_url_final: result.videoUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "in_progress");

        if (!upErr) {
          console.log(`[cron/evolink-poll] Completed: job=${job.id}`);
          completed++;
        }

      } else if (result.status === "failed") {
        await supabase
          .from("jobs")
          .update({
            status: "failed",
            error_message: result.error || "EvoLink generation failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .eq("status", "in_progress");

        console.log(`[cron/evolink-poll] Failed: job=${job.id} error=${result.error}`);
        failed++;

      } else {
        // Still processing — heartbeat: touch updated_at to keep watchdog at bay
        await supabase
          .from("jobs")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", job.id)
          .in("status", ["pending", "in_progress"]);

        processing++;
      }
    } catch (pollErr) {
      console.warn(
        `[cron/evolink-poll] Poll error for job=${job.id}:`,
        pollErr instanceof Error ? pollErr.message : pollErr
      );
      // Non-fatal: continue to next job
    }
  }

  console.log(`[cron/evolink-poll] Done: ${completed} completed, ${failed} failed, ${processing} still processing`);

  return NextResponse.json({
    polled: activeJobs.length,
    completed,
    failed,
    processing,
  });
}
