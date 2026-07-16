/**
 * GET /api/cron/jogg-poll
 *
 * Server-side poller for URL → Video jobs (provider interne : Jogg).
 * Jogg n'a pas de webhook joignable sur ce compte → on poll.
 *
 * Contrairement à evolink-poll (qui délègue à GET /api/jobs/[id]), les jobs
 * `engine_used='jogg'` ne sont PAS gérés par la state machine des scènes : ce
 * poller fait donc le travail complet lui-même :
 *   pending/in_progress → GET Jogg /product_video/{external_task_id}
 *     → completed : download MP4 → R2 → status='done', final_url/video_url
 *     → failed    : status='failed', error_message
 *
 * Branding overlay (T-1111) : volontairement HORS de ce premier jet (V1 ship
 * sans overlay — rendu Jogg déjà propre/sans watermark). Point d'insertion
 * marqué ci-dessous pour le fast-follow, une fois validé que T-1111 accepte
 * un MP4 externe arbitraire.
 *
 * Auth : Authorization: Bearer $CRON_SECRET (déclenché par evolink-cron.yml).
 * Idempotence : 1 job = 1 external_task_id ; on ne re-soumet jamais.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { getProductVideo } from "@/lib/jogg-client";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, external_task_id, app_state, created_at")
    .eq("engine_used", "jogg")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[cron/jogg-poll] DB fetch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const activeJobs = jobs ?? [];
  if (activeJobs.length === 0) {
    return NextResponse.json({ polled: 0, message: "No active jogg jobs" });
  }

  console.log(`[cron/jogg-poll] ${activeJobs.length} active job(s)`);

  let done = 0;
  let failed = 0;
  let pending = 0;
  let errors = 0;

  for (const job of activeJobs) {
    const videoId = job.external_task_id;
    try {
      if (!videoId) {
        await markFailed(supabase, job.id, "missing external_task_id (product_video_id)");
        failed++;
        continue;
      }

      const result = await getProductVideo(videoId);

      if (result.status === "completed" && result.videoUrl) {
        // ── Point d'insertion overlay branding T-1111 (fast-follow) ─────────
        // V1 : passthrough direct du MP4 Jogg vers R2 (rendu déjà propre).
        const r2Url = await downloadAndUploadToR2(result.videoUrl, `url-to-video/${job.id}.mp4`);
        const prevState = (job.app_state as Record<string, unknown> | null) || {};
        await supabase
          .from("jobs")
          .update({
            status: "done",
            current_stage: "done",
            final_url: r2Url,
            video_url: r2Url,
            error_message: null,
            updated_at: new Date().toISOString(),
            app_state: { ...prevState, source_video_url: result.videoUrl },
          })
          .eq("id", job.id);
        done++;
        console.log(`[cron/jogg-poll] job=${job.id.slice(0, 8)} → done`);
      } else if (result.status === "failed") {
        await markFailed(supabase, job.id, result.error || "Jogg generation failed");
        failed++;
      } else {
        pending++;
      }
    } catch (e) {
      console.warn(
        `[cron/jogg-poll] job=${job.id.slice(0, 8)} error:`,
        e instanceof Error ? e.message : e,
      );
      errors++;
    }
  }

  console.log(
    `[cron/jogg-poll] Done: ${done} done, ${failed} failed, ${pending} pending, ${errors} errors`,
  );

  return NextResponse.json({ polled: activeJobs.length, done, failed, pending, errors });
}

async function markFailed(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  message: string,
) {
  await supabase
    .from("jobs")
    .update({
      status: "failed",
      current_stage: "failed",
      error_message: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}
