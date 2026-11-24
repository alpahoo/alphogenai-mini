/**
 * Private audio library for the talking-avatar flow (admin only).
 *
 * Same design as the portrait library (`lib/studio/reference-library.ts`): no table, files in the existing private
 * `references` bucket under `<user_id>/audio-library/<hex(name)>_<uuid>.<wav|mp3>`. The folder is always built from the
 * session, never from the request, and the bucket's per-user folder isolation applies unchanged.
 *
 * Pure functions only: no network, no storage.
 */
export const AUDIO_DIR = "audio-library";
export const MAX_AUDIO_ITEMS = 40;
export const MAX_AUDIO_NAME_LENGTH = 40;
/** Hard cap on the uploaded file. 10 s of 48 kHz stereo 16-bit WAV is about 1.9 MB. */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MIN_AUDIO_SECONDS = 1;
/** First scope: a clip of about 10 seconds. Three segments cover 10.12 s of video. */
export const MAX_AUDIO_SECONDS = 10;
export const EXT_BY_AUDIO_MIME: Record<string, "wav" | "mp3"> = { "audio/vnd.wave": "wav", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FILE = new RegExp(`^((?:[0-9a-f]{2})+)_(${UUID})\\.(wav|mp3)$`);

export interface AudioFileInfo { id: string; name: string; ext: "wav" | "mp3"; fileName: string }

const toHex = (s: string) => Array.from(new TextEncoder().encode(s), b => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(h.match(/../g) ?? [], x => parseInt(x, 16)));

/** Trimmed name, 1 to 40 characters, no control characters. Null when invalid. */
export function cleanAudioName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_AUDIO_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
}

export const audioFileName = (name: string, id: string, ext: "wav" | "mp3") => `${toHex(name)}_${id}.${ext}`;
export const audioPath = (userId: string, fileName: string) => `${userId}/${AUDIO_DIR}/${fileName}`;

/** Decode a library file name. Null for anything that is not a well-formed audio library file. */
export function parseAudioFileName(fileName: string): AudioFileInfo | null {
  const m = FILE.exec(fileName);
  if (!m) return null;
  try { return { id: m[2], name: fromHex(m[1]), ext: m[3] as AudioFileInfo["ext"], fileName }; } catch { return null; }
}

/** True for a path inside the caller's own audio library (no traversal, well-formed file name). */
export function isOwnAudioPath(userId: string, path: unknown): path is string {
  if (typeof path !== "string" || path.includes("..") || path.includes("//")) return false;
  const prefix = `${userId}/${AUDIO_DIR}/`;
  return path.startsWith(prefix) && parseAudioFileName(path.slice(prefix.length)) !== null;
}

/**
 * Exact duration of a PCM/float WAV from its header, or null when the buffer is not a readable WAV.
 * MP3 has no cheap exact duration here: the Modal broker measures it with ffprobe before any GPU is used.
 */
export function wavDurationSeconds(buffer: Uint8Array): number | null {
  if (buffer.length < 44) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const tag = (o: number) => String.fromCharCode(buffer[o], buffer[o + 1], buffer[o + 2], buffer[o + 3]);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let byteRate = 0, offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = tag(offset), size = view.getUint32(offset + 4, true);
    if (id === "fmt " && offset + 8 + 16 <= buffer.length) byteRate = view.getUint32(offset + 16, true);
    if (id === "data") {
      const bytes = Math.min(size, buffer.length - (offset + 8)); // a streaming header may over-declare
      return byteRate > 0 ? bytes / byteRate : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

export interface AudioItem { id: string; name: string; path: string; ext: "wav" | "mp3"; created_at: string | null }
