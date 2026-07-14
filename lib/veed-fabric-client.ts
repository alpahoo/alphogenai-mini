/**
 * VEED Fabric 1.0 client — ISOLATED POC (T-1151). Not wired to any workflow.
 *
 * Fabric = image + audio -> talking video (lip-sync + head/body motion driven by
 * the audio). Hosted on fal.ai; called via its plain REST queue API (no SDK, no
 * new dependency). Auth: `Authorization: Key <FAL_KEY>` (server-only).
 *
 * Queue pattern:
 *  - POST https://queue.fal.run/veed/fabric-1.0            -> { request_id, ... }
 *  - GET  https://queue.fal.run/veed/fabric-1.0/requests/{id}/status -> { status }
 *  - GET  https://queue.fal.run/veed/fabric-1.0/requests/{id}        -> { video: { url } }
 *
 * Deliberately minimal: no provider abstraction, no fallback, no retries. POC only.
 */

const MODEL = "veed/fabric-1.0";
const QUEUE = `https://queue.fal.run/${MODEL}`;

function authHeader(): string {
  const k = process.env.FAL_KEY;
  if (!k) throw new Error("FAL_KEY not configured");
  return `Key ${k}`;
}

export interface FabricInput {
  imageUrl: string;
  audioUrl: string;
  resolution?: "480p" | "720p";
}

/** Submit a Fabric job. Returns the request_id + raw body. */
export async function submitFabric(
  input: FabricInput,
): Promise<{ requestId: string | null; raw: unknown; http: number }> {
  const res = await fetch(QUEUE, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: input.imageUrl,
      audio_url: input.audioUrl,
      resolution: input.resolution ?? "480p",
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text().catch(() => "");
  let raw: unknown = text;
  try { raw = JSON.parse(text); } catch { /* keep text */ }
  const requestId =
    raw && typeof raw === "object" && "request_id" in raw
      ? String((raw as { request_id: unknown }).request_id)
      : null;
  return { requestId, raw, http: res.status };
}

/** Poll a Fabric job. Returns status and, when completed, the output video URL. */
export async function pollFabric(
  requestId: string,
): Promise<{ status: string | null; videoUrl: string | null; raw: unknown; http: number }> {
  const st = await fetch(`${QUEUE}/requests/${encodeURIComponent(requestId)}/status`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const stText = await st.text().catch(() => "");
  let stRaw: unknown = stText;
  try { stRaw = JSON.parse(stText); } catch { /* keep */ }
  const status =
    stRaw && typeof stRaw === "object" && "status" in stRaw
      ? String((stRaw as { status: unknown }).status)
      : null;

  if (status !== "COMPLETED") {
    return { status, videoUrl: null, raw: stRaw, http: st.status };
  }

  // Completed -> fetch the result payload for the video URL.
  const rr = await fetch(`${QUEUE}/requests/${encodeURIComponent(requestId)}`, {
    headers: { Authorization: authHeader() },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const rText = await rr.text().catch(() => "");
  let raw: unknown = rText;
  try { raw = JSON.parse(rText); } catch { /* keep */ }
  let videoUrl: string | null = null;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const v = o.video;
    if (v && typeof v === "object" && typeof (v as Record<string, unknown>).url === "string") {
      videoUrl = (v as { url: string }).url;
    } else if (typeof o.video_url === "string") {
      videoUrl = o.video_url;
    } else if (typeof o.url === "string") {
      videoUrl = o.url;
    }
  }
  return { status, videoUrl, raw, http: rr.status };
}
