/**
 * GET /api/cron/jogg-poll
 *
 * Server-side poller for URL → Video jobs (provider interne : Jogg).
 * Jogg n'a pas de webhook joignable sur ce compte → on poll.
 *
 * Contrairement à evolink-poll (qui délègue à GET /api/jobs/[id]), les jobs
 * `engine_used='jogg'` ne sont PAS gérés par la state machine des scènes : ce
 * poller fait donc le travail complet lui-même (voir lib/jogg-poll-core.ts) :
 *   pending/in_progress → GET Jogg /product_video/{external_task_id}
 *     → completed : download MP4 → R2 → status='done'
 *     → failed    : status='failed'
 *
 * Persistance HONNÊTE : `done`/`failed` ne sont comptés qu'après une écriture DB
 * réussie ; une écriture ratée compte en `errors` et laisse le job récupérable.
 *
 * Auth : FAIL-CLOSED via assertCronAuth (refuse si CRON_SECRET absent/incorrect)
 * — validée AVANT toute création du client service-role.
 * Branding overlay (T-1111) : hors V1 (rendu Jogg déjà propre) — fast-follow.
 * Idempotence : 1 job = 1 external_task_id ; on ne re-soumet jamais.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { getProductVideo } from "@/lib/jogg-client";
import { downloadAndUploadToR2 } from "@/lib/r2";
import { assertCronAuth } from "@/lib/cron-auth";
import {
  settleJoggJob,
  toPublicPollSummary,
  type JoggJobRow,
  type SettleOutcome,
} from "@/lib/jogg-poll-core";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(req: Request) {
  // FAIL-CLOSED — never create the service-role client before this passes.
  const denied = assertCronAuth(req);
  if (denied) return denied;

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

  const deps = {
    getProductVideo,
    download: downloadAndUploadToR2,
    updateJob: async (jobId: string, patch: Record<string, unknown>) => {
      const { error } = await supabase.from("jobs").update(patch).eq("id", jobId);
      return { error };
    },
  };

  const tally: Record<SettleOutcome, number> = { done: 0, failed: 0, pending: 0, error: 0 };

  for (const job of activeJobs) {
    let outcome: SettleOutcome;
    try {
      outcome = await settleJoggJob(job as JoggJobRow, deps);
    } catch (e) {
      outcome = "error";
      console.warn(
        `[cron/jogg-poll] job=${job.id.slice(0, 8)} error:`,
        e instanceof Error ? e.message : e,
      );
    }
    tally[outcome]++;
    if (outcome === "done") console.log(`[cron/jogg-poll] job=${job.id.slice(0, 8)} → done`);
  }

  console.log(
    `[cron/jogg-poll] Done: ${tally.done} done, ${tally.failed} failed, ` +
      `${tally.pending} pending, ${tally.error} errors`,
  );

  return NextResponse.json({
    polled: activeJobs.length,
    ...toPublicPollSummary(tally),
  });
}
