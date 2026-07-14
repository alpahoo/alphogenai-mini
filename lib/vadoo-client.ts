/**
 * Vadoo AI client — ISOLATED POC (T-1150). Not wired to any user workflow.
 *
 * Two documented endpoints (https://docs.vadoo.tv):
 *  - POST https://aiapi.vadoo.tv/api/generate_podcast   → { vid }
 *  - GET  https://viralapi.vadoo.tv/api/get_video_url    → status + final url
 * Auth: X-Api-Key header. Async: create returns a vid, poll get_video_url (or a
 * webhook, unused here). Key read from VADOO_API_KEY (server-only).
 *
 * Deliberately minimal: no provider abstraction, no fallback, no retries beyond
 * the caller's polling loop. This exists only to measure a single POC run.
 */

const CREATE_URL = "https://aiapi.vadoo.tv/api/generate_podcast";
const STATUS_URL = "https://viralapi.vadoo.tv/api/get_video_url";

function apiKey(): string {
  const k = process.env.VADOO_API_KEY;
  if (!k) throw new Error("VADOO_API_KEY not configured");
  return k;
}

export interface VadooPodcastInput {
  text?: string;
  url?: string;
  name1: string;
  name2: string;
  voice1?: string;
  voice2?: string;
  language?: string;
  duration?: string; // "1-2" (short) | "2-5" (long)
  tone?: string;
  theme?: string;
}

/** Create a Vadoo podcast job. Returns the raw response + parsed vid. */
export async function createVadooPodcast(
  input: VadooPodcastInput,
): Promise<{ vid: string | null; raw: unknown; http: number }> {
  const res = await fetch(CREATE_URL, {
    method: "POST",
    headers: { "X-Api-Key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(45_000),
  });
  const raw = await res.json().catch(() => ({}));
  const vid =
    (raw && typeof raw === "object" && "vid" in raw
      ? String((raw as { vid: unknown }).vid)
      : null) || null;
  return { vid, raw, http: res.status };
}

export interface VadooStatus {
  status: string | null;
  videoUrl: string | null;
  raw: unknown;
  http: number;
}

/**
 * Poll a Vadoo job by vid. Field names are parsed defensively because the public
 * docs show slightly different shapes for the webhook ({id,status,url}) vs the
 * get_video_url response.
 */
export async function getVadooVideo(vid: string): Promise<VadooStatus> {
  // The docs are ambiguous on the exact param name; send both.
  const res = await fetch(`${STATUS_URL}?id=${encodeURIComponent(vid)}&vid=${encodeURIComponent(vid)}`, {
    method: "GET",
    headers: { "X-Api-Key": apiKey(), "X-API-KEY": apiKey() },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  let raw: unknown = null;
  const text = await res.text().catch(() => "");
  try { raw = JSON.parse(text); } catch { raw = text; }
  let status: string | null = null;
  let videoUrl: string | null = null;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    status = typeof o.status === "string" ? o.status : null;
    const u = o.url ?? o.video_url ?? o.videoUrl ?? o.output;
    videoUrl = typeof u === "string" && /^https?:\/\//.test(u) ? u : null;
  } else if (typeof raw === "string" && /^https?:\/\//.test(raw.trim())) {
    videoUrl = raw.trim();
    status = "completed";
  }
  return { status, videoUrl, raw, http: res.status };
}
