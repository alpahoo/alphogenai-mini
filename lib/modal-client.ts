/**
 * Thin client around Modal asgi_app webhook endpoints used by the
 * multi-scene EvoLink chaining state machine.
 *
 * All calls fire-and-forget: they spawn a Modal function and return as soon
 * as Modal acknowledges. The Next.js poller then sees the resulting DB
 * mutations on the next GET tick.
 */
import type { OverlayPlan } from "@/lib/overlay/overlay-plan";

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

/**
 * Mux a cloned-voice track into the job's final video (voice-over mode).
 * Modal reads jobs.video_url + jobs.avatar_final.audio_url server-side, lowers
 * the native audio, mixes the voice on top, uploads, and sets
 * jobs.video_url + status="done" + avatar_final.stage="done".
 */
export async function triggerApplyVoiceover(jobId: string): Promise<void> {
  const url = `${modalBase()}/apply-voiceover`;
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
    throw new Error(`Modal /apply-voiceover ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Mux a Research Story's TTS voice-over into its final video (T-1113). Modal
 * reads video_url + voiceover_url server-side, ducks the native audio, mixes the
 * voice on top, uploads a `_voiced` copy, and returns its URL. Like overlays,
 * this returns the URL so the explicit route writes it to output_url_final while
 * keeping video_url raw; on failure the route falls back to the raw video.
 */
export async function triggerApplyResearchVoiceover(jobId: string): Promise<string> {
  const url = `${modalBase()}/apply-research-voiceover`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({ job_id: jobId }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /apply-research-voiceover ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json().catch(() => null)) as { output_url?: unknown } | null;
  const outputUrl = typeof data?.output_url === "string" ? data.output_url : null;
  if (!outputUrl) {
    throw new Error("Modal /apply-research-voiceover returned no output_url");
  }
  return outputUrl;
}

/**
 * Trigger a code-based explainer render (slides + Kokoro voice) on Modal for a
 * research-backed job. Fire-and-forget: Modal renders (CPU), uploads to R2, and
 * sets jobs.output_url_final + status="done"; the Next.js poller / Library then
 * observes it. Mirrors the other webhook triggers in this file.
 */
export async function triggerRenderExplainer(
  jobId: string,
  payload: {
    storyboard: unknown;
    brand?: Record<string, unknown> | null;
    product_url?: string | null;
    voice?: string;
  }
): Promise<void> {
  const url = `${modalBase()}/render-explainer`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({
      job_id: jobId,
      storyboard: payload.storyboard,
      brand: payload.brand ?? null,
      product_url: payload.product_url ?? null,
      voice: payload.voice ?? "af_heart",
    }),
    // Webhook returns in <1 s after Modal accepts the spawn
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /render-explainer ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Apply deterministic post-production overlays to an already completed video.
 * Unlike the other Modal calls in this file, this returns the branded video URL
 * because the explicit overlay route writes it to jobs.output_url_final.
 */
export async function triggerApplyOverlays(
  jobId: string,
  videoUrl: string,
  overlayPlan: OverlayPlan
): Promise<string> {
  const url = `${modalBase()}/apply-overlays`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({
      job_id: jobId,
      video_url: videoUrl,
      overlay_plan: overlayPlan,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /apply-overlays ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null) as { output_url?: unknown; video_url?: unknown } | null;
  const outputUrl =
    typeof data?.output_url === "string"
      ? data.output_url
      : typeof data?.video_url === "string"
        ? data.video_url
        : null;
  if (!outputUrl) {
    throw new Error("Modal /apply-overlays returned no output_url");
  }
  return outputUrl;
}

/**
 * Trigger a two-shot voice-first podcast render (T-1131e) on Modal. Fire-and-forget:
 * Modal reads the podcast/speakers/segments server-side, composites + muxes (CPU),
 * uploads to R2, and sets podcasts.video_url + render_status; the SaaS poller
 * observes it. Only the podcast_id is sent — no client-supplied content.
 */
export async function triggerRenderPodcast(podcastId: string): Promise<void> {
  const url = `${modalBase()}/render-podcast`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({ podcast_id: podcastId }),
    signal: AbortSignal.timeout(15000), // webhook returns after Modal accepts the spawn
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /render-podcast ${res.status}: ${detail.slice(0, 200)}`);
  }
}

/**
 * Physically trim a persona base clip to a segment's audio length on Modal
 * (T-1144b). HeyGen requires audio/video within ±15% and its end_time hint is
 * insufficient; Vercel can't run ffmpeg reliably, so Modal (which has ffmpeg)
 * does the trim and returns a permanent R2 URL. Synchronous: the lip-sync
 * orchestration must have the trimmed URL before calling HeyGen. Throws on
 * failure so the caller can skip the HeyGen spend and fall back.
 */
export async function trimLipsyncBaseClip(input: {
  podcastId: string;
  segmentId: string;
  baseUrl: string;
  durationSeconds: number;
  cacheKey: string;
}): Promise<string> {
  const url = `${modalBase()}/trim-base-clip`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": secret(),
    },
    body: JSON.stringify({
      podcast_id: input.podcastId,
      segment_id: input.segmentId,
      base_url: input.baseUrl,
      duration_seconds: input.durationSeconds,
      cache_key: input.cacheKey,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Modal /trim-base-clip ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json().catch(() => null)) as { url?: unknown } | null;
  const outUrl = typeof data?.url === "string" ? data.url : null;
  if (!outUrl) throw new Error("Modal /trim-base-clip returned no url");
  return outUrl;
}

/**
 * Normalize a retained private performance clip for the native presenter
 * pipeline. Modal reads the private source and writes the private normalized
 * output server-side, then updates user_presenter_native_bases. The webhook
 * only receives the opaque base id and returns immediately after spawning.
 */
export async function triggerNormalizeNativePresenterBase(baseId: string): Promise<void> {
  const webhookSecret = secret();
  if (!webhookSecret) {
    throw new Error("MODAL_WEBHOOK_SECRET not configured");
  }
  const url = `${modalBase()}/normalize-native-presenter-base`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": webhookSecret,
    },
    body: JSON.stringify({ base_id: baseId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `Modal /normalize-native-presenter-base ${res.status}: ${detail.slice(0, 200)}`,
    );
  }
}

/**
 * Compose one completed private native presenter animation into a short
 * Product Ad. Modal reads every media path and product setting server-side
 * from the job; the request carries only the opaque job id.
 */
export async function triggerRenderNativeProductAd(jobId: string): Promise<void> {
  const webhookSecret = secret();
  if (!webhookSecret) {
    throw new Error("MODAL_WEBHOOK_SECRET not configured");
  }
  const url = `${modalBase()}/render-native-product-ad`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": webhookSecret,
    },
    body: JSON.stringify({ job_id: jobId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(
      `Modal /render-native-product-ad ${res.status}: ${detail.slice(0, 200)}`,
    );
  }
}
