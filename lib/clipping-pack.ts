export const CLIPPING_SOURCE_MIMES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export const CLIPPING_MAX_BYTES = 1024 * 1024 * 1024;

export function validateClippingPrepare(input: unknown):
  | { value: { title: string; mime: string; size: number; clipCount: number }; error?: never }
  | { value?: never; error: string } {
  if (!input || typeof input !== "object") return { error: "Invalid request." };
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const mime = typeof body.mime === "string" ? body.mime : "";
  const size = Number(body.size);
  const clipCount = Number(body.clip_count ?? 3);
  if (!title) return { error: "Name this clipping project." };
  if (!(CLIPPING_SOURCE_MIMES as readonly string[]).includes(mime)) return { error: "Use an MP4, MOV, or WEBM video." };
  if (!Number.isFinite(size) || size <= 0 || size > CLIPPING_MAX_BYTES) return { error: "Video must be smaller than 1 GB." };
  if (!Number.isInteger(clipCount) || clipCount < 1 || clipCount > 8) return { error: "Choose between 1 and 8 Shorts." };
  return { value: { title, mime, size, clipCount } };
}

export function clippingExtension(mime: string): string {
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "mp4";
}
