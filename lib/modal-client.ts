/**
 * Thin client around Modal asgi_app webhook endpoints used by the
 * multi-scene EvoLink chaining state machine.
 *
 * All calls fire-and-forget: they spawn a Modal function and return as soon
 * as Modal acknowledges. The Next.js poller then sees the resulting DB
 * mutations on the next GET tick.
 */

function modalBase(): string {
  const raw = process.env.MODAL_WEBHOOK_URL;
  if (!raw) throw new Error("MODAL_WEBHOOK_URL not configured");
  return raw.replace(/\/+$/, "").replace(/\/webhook$/, "");
}

function secret(): string {
  return process.env.MODAL_WEBHOOK_SECRET ?? "";
}

/**
 * Trigger ffmpeg last-frame extraction for the given scene.
 * Modal will write the frame URL back to job_scenes[scene_index].last_frame_url.
 *
 * Throws on Modal HTTP error so the caller can decide whether to retry on
 * the next poll or mark the job as failed.
 */
export async function triggerExtractLastFrame(
  jobId: string,
  sceneIndex: number,
  videoUrl: string
): Promise<void> {
  const url = `${modalBase()}/extract-frame`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({
      job_id: jobId,
      scene_index: sceneIndex,
      video_url: videoUrl,
    }),
    // Webhook responds in <1 s after Modal accepts the spawn
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /extract-frame ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Trigger final concat of every done scene of a job. Modal reads
 * clip_urls server-side from Supabase — the request body only carries the
 * job id.  Modal updates jobs.video_url + status="done" when finished.
 */
export async function triggerConcatScenes(jobId: string): Promise<void> {
  const url = `${modalBase()}/concat-scenes`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({ job_id: jobId }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /concat-scenes ${res.status}: ${detail.slice(0, 200)}`);
  }
}
