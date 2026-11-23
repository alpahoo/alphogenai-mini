import { NATIVE_PRESENTER_ANIMATION_MAX_SECONDS } from "./video-presenter-native-animation";

function baseUrl() {
  const raw = process.env.MODAL_LATENTSYNC_URL;
  if (!raw) throw new Error("Native animation service is not configured");
  return raw.replace(/\/+$/, "");
}

function headers() {
  const secret = process.env.MODAL_WEBHOOK_SECRET;
  if (!secret) throw new Error("Native animation service is not configured");
  return {
    "Content-Type": "application/json",
    "x-webhook-secret": secret,
  };
}

export async function startNativePresenterAnimation(input: {
  videoUrl: string;
  audioUrl: string;
  outputPath: string;
}) {
  const response = await fetch(`${baseUrl()}/native/start`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      video_url: input.videoUrl,
      audio_url: input.audioUrl,
      output_path: input.outputPath,
      max_seconds: NATIVE_PRESENTER_ANIMATION_MAX_SECONDS,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Native animation start ${response.status}: ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json().catch(() => null)) as
    | { call_id?: unknown }
    | null;
  if (typeof payload?.call_id !== "string" || !payload.call_id) {
    throw new Error("Native animation start returned no task id");
  }
  return payload.call_id;
}

export async function pollNativePresenterAnimation(taskId: string) {
  const response = await fetch(
    `${baseUrl()}/native/status?call_id=${encodeURIComponent(taskId)}`,
    {
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 202) return { status: "processing" as const };
  const payload = (await response.json().catch(() => null)) as
    | {
        status?: unknown;
        output_path?: unknown;
        error?: unknown;
        output_probe?: { duration_seconds?: unknown } | null;
      }
    | null;
  if (!response.ok || payload?.status === "failed") {
    return {
      status: "failed" as const,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `Native animation poll ${response.status}`,
    };
  }
  if (
    payload?.status === "completed"
    && typeof payload.output_path === "string"
    && payload.output_path
  ) {
    return {
      status: "completed" as const,
      outputPath: payload.output_path,
      durationSeconds:
        typeof payload.output_probe?.duration_seconds === "number"
          ? payload.output_probe.duration_seconds
          : null,
    };
  }
  return { status: "processing" as const };
}

export const UGC_LIPSYNC_POLISH_MAX_SECONDS = 16;
const UGC_LIPSYNC_START_TIMEOUT_MS = 60_000;

export async function startUGCLipSyncPolish(input: {
  videoUrl: string;
  audioUrl: string;
}) {
  const response = await fetch(`${baseUrl()}/start`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      video_url: input.videoUrl,
      audio_url: input.audioUrl,
      max_seconds: UGC_LIPSYNC_POLISH_MAX_SECONDS,
    }),
    // The web endpoint only spawns the GPU task, but its first request may still
    // wait for a Modal web-container cold start.
    signal: AbortSignal.timeout(UGC_LIPSYNC_START_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Lip-sync polish start ${response.status}: ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json().catch(() => null)) as
    | { call_id?: unknown }
    | null;
  if (typeof payload?.call_id !== "string" || !payload.call_id) {
    throw new Error("Lip-sync polish start returned no task id");
  }
  return payload.call_id;
}

export async function pollUGCLipSyncPolish(taskId: string) {
  const response = await fetch(
    `${baseUrl()}/status?call_id=${encodeURIComponent(taskId)}`,
    { headers: headers(), signal: AbortSignal.timeout(15_000) },
  );
  if (response.status === 202) return { status: "processing" as const };
  const payload = (await response.json().catch(() => null)) as
    | { status?: unknown; output_url?: unknown; error?: unknown }
    | null;
  if (!response.ok || payload?.status === "failed") {
    return {
      status: "failed" as const,
      error:
        typeof payload?.error === "string"
          ? payload.error
          : `Lip-sync polish poll ${response.status}`,
    };
  }
  if (
    payload?.status === "completed"
    && typeof payload.output_url === "string"
    && payload.output_url
  ) {
    return { status: "completed" as const, outputUrl: payload.output_url };
  }
  return { status: "processing" as const };
}
