import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import {
  isEvoLinkEngine,
  getEvoLinkTask,
  createEvoLinkTask,
  engineSupportsFirstFrame,
} from "@/lib/evolink-client";
import { isBailianEngine, getBailianTask, createBailianTask } from "@/lib/bailian-client";
import { triggerExtractLastFrame, triggerConcatScenes } from "@/lib/modal-client";
import { generateVoiceover, isTTSAvailable } from "@/lib/tts";
import { uploadBufferToR2 } from "@/lib/r2";

// Give this route enough time to poll EvoLink, fire the next scene, and
// trigger Modal helpers. No large file work happens here — only HTTP.
export const maxDuration = 30;

// If the previous scene has been done for longer than this without a
// last_frame_url showing up, assume the extract trigger was lost and retry.
const EXTRACT_RETRY_MS = 90_000; // 90 seconds

// Mirror the POST route cap. Defense in depth.
const MAX_CHAIN_LENGTH = 25;

/** Strip "[SCENE N - LABEL]" markers — same logic as POST. */
function cleanEvoLinkPrompt(raw: string): string {
  return raw
    .replace(/\[SCENE\s*\d+[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

interface SceneRow {
  id: string;
  scene_index: number;
  prompt: string;
  engine: string;
  duration_sec: number | string;
  status: string;
  clip_url: string | null;
  external_task_id: string | null;
  last_frame_url: string | null;
  metadata: Record<string, unknown> | null;
  error_message: string | null;
  updated_at: string;
}

/**
 * GET /api/jobs/[id]
 * Fetch job status. For EvoLink jobs (single OR multi-scene) this also
 * advances the per-scene state machine on every call:
 *
 *   1. The currently `generating` scene is polled against EvoLink.
 *   2. When it completes:
 *        - last scene → trigger Modal /concat-scenes
 *        - otherwise + chaining ON → trigger Modal /extract-frame
 *        - otherwise + chaining OFF → fire the next scene immediately
 *   3. Pending scenes whose previous scene is done get fired here as soon
 *      as their `first_frame_url` is available (or immediately, if chain
 *      is OFF).
 *
 * The handler does at most ONE state transition per call so it always
 * finishes well under maxDuration.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: job, error: selectError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (selectError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const isEvoLink = isEvoLinkEngine(job.engine_used ?? "");
    const isBailian = isBailianEngine(job.engine_used ?? "");

    // ── Provider state machine ────────────────────────────────────────
    // Runs for both EvoLink and Bailian engines while the job is in flight.
    if ((isEvoLink || isBailian) && job.status === "in_progress") {
      const stage = (job.current_stage as string | null) ?? "";

      if (stage === "encoding" || stage === "uploading") {
        // Concat / final upload is running on Modal. Don't interfere — and
        // specifically do NOT call heartbeat() here, otherwise the stale
        // detector below never fires. If it's been more than 5 minutes since
        // the last DB update, the Modal function likely died; retry once.
        try {
          const updatedAt = new Date(job.updated_at as string).getTime();
          if (Date.now() - updatedAt > 5 * 60_000) {
            console.warn(
              `[jobs/status] concat stale (job=${id}), retriggering`
            );
            await triggerConcatScenes(id);
            // Bump updated_at so we don't retrigger again for another 5 min
            await supabase
              .from("jobs")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", id);
          }
        } catch (e) {
          console.warn(
            `[jobs/status] concat retry probe failed:`,
            e instanceof Error ? e.message : e
          );
        }
      } else if (stage !== "completed") {
        try {
          await advanceEvoLinkState(supabase, job);
        } catch (advErr) {
          // Non-fatal: log and return current job state. The next poll will
          // try again.
          console.warn(
            `[jobs/status] state-advance error (job=${id}):`,
            advErr instanceof Error ? advErr.message : advErr
          );
        }
      }
    }

    // ── Voice-over generation (post-video, one-shot) ────────────────────
    // After video is finalized, generate TTS if requested. Runs exactly
    // once: guarded by `!job.voiceover_url`. Fast (2-5s API call).
    const hasVideo = !!(job.video_url || job.output_url_final);
    const needsVoiceover =
      hasVideo &&
      job.voiceover_text &&
      typeof job.voiceover_text === "string" &&
      job.voiceover_text.length > 2 &&
      !job.voiceover_url;

    if (needsVoiceover && isTTSAvailable()) {
      try {
        console.log(`[jobs/audio] Generating voice-over for job=${id}`);
        const ttsResult = await generateVoiceover({
          text: job.voiceover_text as string,
          format: "mp3",
        });
        const audioKey = `audio/voiceover/${id}.mp3`;
        const voiceoverUrl = await uploadBufferToR2(
          Buffer.from(ttsResult.audio),
          audioKey,
          "audio/mpeg"
        );
        await supabase
          .from("jobs")
          .update({
            voiceover_url: voiceoverUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        console.log(
          `[jobs/audio] Voice-over ready: ${voiceoverUrl.slice(0, 60)}... ` +
          `(${ttsResult.provider}, ~${ttsResult.duration_estimate}s)`
        );
      } catch (e) {
        console.warn(
          `[jobs/audio] TTS generation failed (non-fatal):`,
          e instanceof Error ? e.message : e
        );
      }
    }

    // ── Re-fetch to return latest state ────────────────────────────────
    const { data: latestJob } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", id)
      .single();

    const { data: scenes } = await supabase
      .from("job_scenes")
      .select("*")
      .eq("job_id", id)
      .order("scene_index", { ascending: true });

    return NextResponse.json({
      success: true,
      job: formatJob(latestJob ?? job),
      scenes: scenes ?? [],
    });
  } catch (error: unknown) {
    console.error("Error in GET /api/jobs/[id]:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Advance the EvoLink scene state machine by exactly one transition.
 *
 * Steps in priority order:
 *   1. If a scene is currently generating → poll EvoLink, react to result.
 *   2. Else if a pending scene is ready to fire → fire it.
 *   3. Else if all scenes done but job not finalized → trigger concat.
 *   4. Otherwise → heartbeat (keep updated_at fresh for watchdog).
 *
 * Returns nothing — DB mutations are the side effects the poller observes.
 */
async function advanceEvoLinkState(
  supabase: ReturnType<typeof createServiceClient>,
  job: Record<string, unknown>
): Promise<void> {
  const jobId = job.id as string;
  const engineKey = (job.engine_used as string) ?? "";
  const chainEnabled = job.multi_scene_chain !== false;

  // Load all scenes for this job, ordered
  const { data: rawScenes } = await supabase
    .from("job_scenes")
    .select("*")
    .eq("job_id", jobId)
    .order("scene_index", { ascending: true });

  const scenes = (rawScenes as SceneRow[] | null) ?? [];
  if (scenes.length === 0) {
    // No scenes? Legacy single-scene job — fall back to job.external_task_id
    // path (this is the original behavior preserved for safety).
    await advanceLegacySingleScene(supabase, job);
    return;
  }

  // Cap defense
  const effectiveScenes = scenes.slice(0, MAX_CHAIN_LENGTH);

  // ── Step 1: poll the currently generating scene ──────────────────────
  const generating = effectiveScenes.find(
    (s) => s.status === "generating" && s.external_task_id
  );

  if (generating) {
    // ── Stale scene guard: if a scene has been "generating" for over 15
    // minutes, the upstream task is almost certainly dead. Mark it failed
    // so the user isn't stuck forever.
    const sceneAge = Date.now() - new Date(generating.updated_at).getTime();
    if (sceneAge > 15 * 60_000) {
      console.warn(
        `[jobs/status] scene ${generating.scene_index} stale (${Math.round(sceneAge / 60_000)}min) — marking failed`
      );
      await supabase
        .from("job_scenes")
        .update({ status: "failed", error_message: "Generation timed out (>15min)" })
        .eq("id", generating.id);
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: `Scene ${generating.scene_index + 1} timed out after 15 minutes. Please retry.`,
        })
        .eq("id", jobId)
        .eq("status", "in_progress");
      return;
    }

    // Poll the correct provider based on engine_used
    let result: { status: string; videoUrl?: string; errorMessage?: string };
    try {
      if (isBailianEngine(engineKey)) {
        const br = await getBailianTask(generating.external_task_id!);
        result = {
          status: br.status === "succeeded" ? "completed" : br.status,
          videoUrl: br.videoUrl,
          errorMessage: br.errorMessage,
        };
      } else {
        const er = await getEvoLinkTask(generating.external_task_id!);
        result = {
          status: er.status,
          videoUrl: er.videoUrl,
          errorMessage: er.error,
        };
      }
    } catch (e) {
      // Transient error — heartbeat and bail
      console.warn(
        `[jobs/status] poll error scene=${generating.scene_index}:`,
        e instanceof Error ? e.message : e
      );
      await heartbeat(supabase, jobId);
      return;
    }

    if (result.status === "completed" && result.videoUrl) {
      const isLast = generating.scene_index === effectiveScenes.length - 1;
      const sceneNum = generating.scene_index + 1;

      // Mark scene as done — atomic guard so a duplicate poll is a no-op
      const { error: claimErr } = await supabase
        .from("job_scenes")
        .update({
          status: "done",
          clip_url: result.videoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", generating.id)
        .eq("status", "generating");

      if (claimErr) {
        console.warn(
          `[jobs/status] claim failed scene=${generating.scene_index}:`,
          claimErr.message
        );
        return;
      }

      console.log(
        `[jobs/status] scene ${sceneNum}/${effectiveScenes.length} done: job=${jobId} ` +
        `url=${result.videoUrl.slice(0, 80)}`
      );

      if (isLast) {
        // Last scene complete: kick off concat. Modal updates job → done.
        await supabase
          .from("jobs")
          .update({
            current_stage: "encoding",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)
          .eq("status", "in_progress");

        if (effectiveScenes.length === 1) {
          // Single-scene EvoLink job: no concat needed, write final URL directly
          await supabase
            .from("jobs")
            .update({
              status: "done",
              current_stage: "completed",
              video_url: result.videoUrl,
              output_url_final: result.videoUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .eq("status", "in_progress");
        } else {
          try {
            await triggerConcatScenes(jobId);
          } catch (e) {
            console.error(`[jobs/status] concat trigger failed:`, e);
            // Non-fatal: next poll will retry via the all-done safety net
          }
        }
      } else if (chainEnabled && engineSupportsFirstFrame(engineKey)) {
        // Need the last frame for chaining the next scene
        try {
          await markExtractTriggered(supabase, generating.id);
          await triggerExtractLastFrame(jobId, generating.scene_index, result.videoUrl);
        } catch (e) {
          console.error(
            `[jobs/status] extract trigger failed scene=${generating.scene_index}:`,
            e
          );
          // Will retry on next poll via EXTRACT_RETRY_MS branch
        }
      } else {
        // Chain disabled (or engine has no I2V): fire next scene immediately
        // without first_frame_url
        const next = effectiveScenes[generating.scene_index + 1];
        if (next && next.status === "pending") {
          await fireNextScene(supabase, job, next, undefined);
        }
      }
      return;
    }

    if (result.status === "failed") {
      await supabase
        .from("job_scenes")
        .update({
          status: "failed",
          error_message: (result.errorMessage || "Generation failed").slice(0, 400),
        })
        .eq("id", generating.id);

      await supabase
        .from("jobs")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: `Scene ${generating.scene_index + 1} failed: ${result.errorMessage || "Unknown error"}`.slice(
            0,
            500
          ),
        })
        .eq("id", jobId)
        .eq("status", "in_progress");

      console.warn(
        `[jobs/status] scene ${generating.scene_index + 1} failed: ${result.errorMessage}`
      );
      return;
    }

    // Still processing — heartbeat
    await heartbeat(supabase, jobId);
    return;
  }

  // ── Step 2: fire the next pending scene if its frame is ready ───────
  const nextPending = effectiveScenes.find((s) => s.status === "pending");
  if (nextPending) {
    const prev = effectiveScenes[nextPending.scene_index - 1];

    // ── Cascade failure: if the predecessor failed, all subsequent pending
    // scenes can never fire. Mark them all as failed so Step 4 triggers.
    if (prev && prev.status === "failed") {
      const pendingIds = effectiveScenes
        .filter((s) => s.status === "pending")
        .map((s) => s.id);

      console.warn(
        `[jobs/status] cascading failure: scene ${prev.scene_index} failed → ` +
        `cancelling ${pendingIds.length} pending scenes`
      );

      await supabase
        .from("job_scenes")
        .update({
          status: "failed",
          error_message: "Cancelled: predecessor scene failed",
          updated_at: new Date().toISOString(),
        })
        .in("id", pendingIds);

      // Fall through to Step 4 (partial failure exit) on next poll
      await heartbeat(supabase, jobId);
      return;
    }

    if (!prev || prev.status !== "done") {
      // Previous scene isn't done yet — nothing to do right now
      await heartbeat(supabase, jobId);
      return;
    }

    if (chainEnabled && engineSupportsFirstFrame(engineKey)) {
      if (prev.last_frame_url) {
        // Frame is ready — fire the next scene with continuity
        await fireNextScene(supabase, job, nextPending, prev.last_frame_url);
        return;
      }

      // Frame extraction in flight. If it's been too long, retry the trigger.
      const triggeredAt = parseTriggeredAt(prev);
      const sinceTrigger = triggeredAt ? Date.now() - triggeredAt : Infinity;

      if (sinceTrigger > EXTRACT_RETRY_MS && prev.clip_url) {
        console.warn(
          `[jobs/status] extract for scene ${prev.scene_index} stale (${Math.round(
            sinceTrigger / 1000
          )}s) — retrying`
        );
        try {
          await markExtractTriggered(supabase, prev.id);
          await triggerExtractLastFrame(jobId, prev.scene_index, prev.clip_url);
        } catch (e) {
          console.error(`[jobs/status] extract retry failed:`, e);
        }
      }

      // Otherwise just wait for the extract to finish
      await heartbeat(supabase, jobId);
      return;
    }

    // Chain OFF — fire next scene independently
    await fireNextScene(supabase, job, nextPending, undefined);
    return;
  }

  // ── Step 3: all scenes done but job not finalized? Trigger concat ────
  const allDone = effectiveScenes.every((s) => s.status === "done");
  if (allDone && !job.video_url) {
    console.log(`[jobs/status] all scenes done, finalizing job=${jobId}`);
    if (effectiveScenes.length === 1) {
      const only = effectiveScenes[0].clip_url!;
      await supabase
        .from("jobs")
        .update({
          status: "done",
          current_stage: "completed",
          video_url: only,
          output_url_final: only,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("status", "in_progress");
    } else {
      try {
        await triggerConcatScenes(jobId);
      } catch (e) {
        console.error(`[jobs/status] concat retry failed:`, e);
      }
    }
    return;
  }

  // ── Step 4: partial failure — no generating, no pending, some failed ──
  // This catches the case where the watchdog (or a scene error) marked some
  // scenes as failed while others completed. Without this exit path the
  // poller would heartbeat forever.
  const hasFailed = effectiveScenes.some((s) => s.status === "failed");
  const noneInFlight = !effectiveScenes.some(
    (s) => s.status === "generating" || s.status === "pending"
  );

  if (hasFailed && noneInFlight) {
    const doneCount = effectiveScenes.filter((s) => s.status === "done").length;
    const failedCount = effectiveScenes.filter((s) => s.status === "failed").length;
    const failedIndices = effectiveScenes
      .filter((s) => s.status === "failed")
      .map((s) => s.scene_index + 1)
      .join(", ");

    console.warn(
      `[jobs/status] partial failure: ${doneCount} done, ${failedCount} failed (scenes: ${failedIndices}) — marking job failed`
    );

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message:
          `${doneCount}/${effectiveScenes.length} scenes completed. ` +
          `Scene(s) ${failedIndices} failed. Please retry.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "in_progress");
    return;
  }

  // Default: nothing to do, heartbeat
  await heartbeat(supabase, jobId);
}

/**
 * Fire the next EvoLink scene. Updates the scene to status='generating' and
 * mirrors the active task_id on the job row for legacy / log inspection.
 */
async function fireNextScene(
  supabase: ReturnType<typeof createServiceClient>,
  job: Record<string, unknown>,
  scene: SceneRow,
  firstFrameUrl: string | undefined
): Promise<void> {
  const jobId = job.id as string;
  const engineKey = (job.engine_used as string) ?? "";
  const sceneNum = scene.scene_index + 1;

  const prompt = cleanEvoLinkPrompt(scene.prompt);
  const duration = Math.round(Number(scene.duration_sec) || 5);

  console.log(
    `[jobs/status] firing scene ${sceneNum} job=${jobId} engine=${engineKey} ` +
    `firstFrame=${firstFrameUrl ? firstFrameUrl.slice(0, 60) + "..." : "none"}`
  );

  // V1 Multi-Reference: propagate refs from the job row to every chained
  // scene so character_face / style remain consistent across the whole
  // multi-scene render (not just scene 0). The shape on the DB row matches
  // the ReferencePayload contract; runtime-safe inside createEvoLinkTask.
  const jobReferences = job.references_payload as
    | Parameters<typeof createEvoLinkTask>[0]["references"]
    | undefined;

  let taskId: string;
  try {
    if (isBailianEngine(engineKey)) {
      taskId = await createBailianTask({
        engineKey,
        prompt,
        duration,
        imageUrl: firstFrameUrl,
      });
    } else {
      taskId = await createEvoLinkTask({
        engineKey,
        prompt,
        duration,
        imageUrl: firstFrameUrl,
        aspectRatio: (job.aspect_ratio as string) ?? "16:9",
        references: jobReferences,
      });
    }
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[jobs/status] scene ${sceneNum} create failed:`, errMsg);

    await supabase
      .from("job_scenes")
      .update({
        status: "failed",
        error_message: errMsg.slice(0, 400),
      })
      .eq("id", scene.id);

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        current_stage: "failed",
        error_message: `Scene ${sceneNum} create failed: ${errMsg}`.slice(0, 500),
      })
      .eq("id", jobId)
      .eq("status", "in_progress");
    return;
  }

  // Atomic claim — only the first poll to detect the pending → fire transition
  // wins this update; concurrent pollers are no-ops.
  const { error: claimErr } = await supabase
    .from("job_scenes")
    .update({
      status: "generating",
      external_task_id: taskId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scene.id)
    .eq("status", "pending");

  if (claimErr) {
    console.warn(`[jobs/status] scene ${sceneNum} claim failed:`, claimErr.message);
    return;
  }

  // Stage labels are bounded — only generating_scene_1..5 exist; map higher
  // indices to scene_5 to avoid invalid enum values.
  const stageNum = Math.min(sceneNum, 5);
  await supabase
    .from("jobs")
    .update({
      external_task_id: taskId,
      current_stage: `generating_scene_${stageNum}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/** Lightweight heartbeat so the watchdog doesn't kill an in-flight job.
 *  Also bumps pending scenes' updated_at so they don't appear stale. */
async function heartbeat(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("jobs")
    .update({ updated_at: now })
    .eq("id", jobId)
    .in("status", ["pending", "in_progress"]);

  // Keep pending scenes fresh — defense in depth against any future watchdog
  await supabase
    .from("job_scenes")
    .update({ updated_at: now })
    .eq("job_id", jobId)
    .eq("status", "pending");
}

function parseTriggeredAt(scene: SceneRow): number | null {
  const md = scene.metadata;
  if (!md || typeof md !== "object") return null;
  const v = (md as Record<string, unknown>).extract_triggered_at;
  if (typeof v !== "number") return null;
  return v;
}

async function markExtractTriggered(
  supabase: ReturnType<typeof createServiceClient>,
  sceneId: string
): Promise<void> {
  // Read-modify-write the metadata JSONB to set extract_triggered_at=now
  const { data } = await supabase
    .from("job_scenes")
    .select("metadata")
    .eq("id", sceneId)
    .single();

  const md = (data?.metadata as Record<string, unknown>) ?? {};
  md.extract_triggered_at = Date.now();
  await supabase.from("job_scenes").update({ metadata: md }).eq("id", sceneId);
}

/**
 * Legacy fallback for jobs that were created before per-scene tracking was
 * added (no rows in job_scenes). Polls jobs.external_task_id directly.
 * Mirrors the previous behavior verbatim.
 */
async function advanceLegacySingleScene(
  supabase: ReturnType<typeof createServiceClient>,
  job: Record<string, unknown>
): Promise<void> {
  const jobId = job.id as string;
  const taskId = job.external_task_id as string | null;
  if (!taskId) return;

  const engineUsed = (job.engine_used as string) ?? "";
  let result: { status: string; videoUrl?: string; errorMessage?: string };
  try {
    if (isBailianEngine(engineUsed)) {
      const br = await getBailianTask(taskId);
      result = {
        status: br.status === "succeeded" ? "completed" : br.status,
        videoUrl: br.videoUrl,
        errorMessage: br.errorMessage,
      };
    } else {
      const er = await getEvoLinkTask(taskId);
      result = {
        status: er.status,
        videoUrl: er.videoUrl,
        errorMessage: er.error,
      };
    }
  } catch (e) {
    console.warn(`[jobs/status legacy] poll error:`, e instanceof Error ? e.message : e);
    return;
  }

  if (result.status === "completed" && result.videoUrl) {
    await supabase
      .from("jobs")
      .update({
        status: "done",
        current_stage: "completed",
        video_url: result.videoUrl,
        output_url_final: result.videoUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("status", "in_progress");
  } else if (result.status === "failed") {
    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: result.errorMessage || "Generation failed",
      })
      .eq("id", jobId)
      .eq("status", "in_progress");
  } else {
    await heartbeat(supabase, jobId);
  }
}

function formatJob(job: Record<string, unknown>) {
  return {
    id: job.id,
    prompt: job.prompt,
    plan: job.plan,
    status: job.status,
    current_stage: job.current_stage,
    video_url: job.video_url,
    audio_url: job.audio_url,
    voiceover_url: job.voiceover_url ?? null,
    audio_mode: job.audio_mode ?? null,
    output_url_final: job.output_url_final,
    error_message: job.error_message,
    storyboard: job.storyboard ?? null,
    target_duration_seconds: job.target_duration_seconds ?? 5,
    engine_used: job.engine_used ?? null,
    estimated_cost_usd: job.estimated_cost_usd ?? null,
    multi_scene_chain: job.multi_scene_chain ?? true,
    social_exports: job.social_exports ?? null,
    aspect_ratio: job.aspect_ratio ?? null,
    caption_mode: job.caption_mode ?? null,
    created_at: job.created_at,
    updated_at: job.updated_at,
  };
}

/**
 * DELETE /api/jobs/[id]
 * Permanently deletes a job owned by the authenticated user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { data: job } = await supabase
      .from("jobs")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await supabase.from("job_scenes").delete().eq("job_id", id);
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error in DELETE /api/jobs/[id]:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
