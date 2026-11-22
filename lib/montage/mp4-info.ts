/**
 * Reads what a montage needs to know about an MP4 clip: the video format (codec configuration, size, frame rate,
 * exact length from the frame table) and the audio format. Pure: no network, no storage, no ffmpeg.
 *
 * Two clips can be joined without re-encoding the video only if their video configuration is identical. The exact
 * video length (frames / frame rate) is also what each clip's audio is cut to, so that sound and picture stay in
 * step at every cut: an AAC track is a few milliseconds longer than its video (encoder delay and padding), and
 * that surplus would otherwise add up at every join.
 */

export class MontageError extends Error {
  constructor(public code: "unreadable" | "no_video" | "no_audio" | "different_format" | "unavailable" | "failed" | "invalid", message: string, public status: 400 | 404 | 409 | 422 | 500 | 501 = 422) { super(message); }
}

export interface ClipInfo {
  video: { codec: string; width: number; height: number; config: string; timescale: number; frameDelta: number; frames: number; durationS: number };
  audio: { codec: string; channels: number; sampleRate: number } | null;
}

interface Box { type: string; start: number; end: number; body: number }

function* boxes(view: DataView, start: number, end: number): Generator<Box> {
  let i = start;
  while (i + 8 <= end) {
    let size = view.getUint32(i); let header = 8;
    const type = String.fromCharCode(view.getUint8(i + 4), view.getUint8(i + 5), view.getUint8(i + 6), view.getUint8(i + 7));
    if (size === 1) { size = Number(view.getBigUint64(i + 8)); header = 16; } else if (size === 0) size = end - i;
    if (size < header || i + size > end) return;
    yield { type, start: i, end: i + size, body: i + header };
    i += size;
  }
}

const child = (view: DataView, parent: Box, type: string): Box | undefined => { for (const b of boxes(view, parent.body, parent.end)) if (b.type === type) return b; };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

/** Sample entry bodies: visual entries carry their child boxes after 78 bytes, audio entries after 28 bytes. */
function readTrack(view: DataView, bytes: Uint8Array, trak: Box) {
  const mdia = child(view, trak, "mdia"); if (!mdia) return null;
  const handler = child(view, mdia, "hdlr"); const mdhd = child(view, mdia, "mdhd");
  const minf = child(view, mdia, "minf"); const stbl = minf && child(view, minf, "stbl");
  const stsd = stbl && child(view, stbl, "stsd"); const stts = stbl && child(view, stbl, "stts");
  if (!handler || !mdhd || !stsd || !stts) return null;
  const kind = String.fromCharCode(...bytes.subarray(handler.body + 8, handler.body + 12));
  const timescale = view.getUint32(mdhd.body + (view.getUint8(mdhd.body) === 1 ? 20 : 12));
  const entry = stsd.body + 8; // after version/flags and entry count
  const entryType = String.fromCharCode(...bytes.subarray(entry + 4, entry + 8));
  const entryBody = entry + 8;
  let frames = 0, total = 0, firstDelta = 0;
  const n = view.getUint32(stts.body + 4);
  for (let k = 0, o = stts.body + 8; k < n; k++, o += 8) {
    const count = view.getUint32(o), delta = view.getUint32(o + 4);
    if (k === 0) firstDelta = delta;
    frames += count; total += count * delta;
  }
  if (kind === "vide") {
    const width = view.getUint16(entryBody + 24), height = view.getUint16(entryBody + 26);
    const entryEnd = entry + view.getUint32(entry);
    let config = "";
    for (const b of boxes(view, entryBody + 78, entryEnd)) if (b.type === "avcC" || b.type === "hvcC") config = `${b.type}:${hex(bytes.subarray(b.body, b.end))}`;
    return { kind, codec: entryType, width, height, config, timescale, frameDelta: firstDelta, frames, durationS: total / timescale };
  }
  if (kind === "soun") {
    return { kind, codec: entryType, channels: view.getUint16(entryBody + 16), sampleRate: view.getUint32(entryBody + 24) >>> 16, timescale, frames, durationS: total / timescale };
  }
  return null;
}

export function readClipInfo(input: Uint8Array): ClipInfo {
  try {
    const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
    let moov: Box | undefined, covered = 0;
    for (const b of boxes(view, 0, input.byteLength)) { if (b.type === "moov") moov = b; covered = b.end; }
    // Every byte must belong to a well-formed top-level box: a truncated download is refused here, not by ffmpeg.
    if (!moov || covered !== input.byteLength) throw new MontageError("unreadable", "This file is not a readable MP4.");
    let video: ClipInfo["video"] | null = null; let audio: ClipInfo["audio"] = null;
    for (const trak of boxes(view, moov.body, moov.end)) {
      if (trak.type !== "trak") continue;
      const t = readTrack(view, input, trak);
      if (!t) continue;
      if (t.kind === "vide" && !video) video = { codec: t.codec, width: t.width!, height: t.height!, config: t.config!, timescale: t.timescale, frameDelta: t.frameDelta!, frames: t.frames, durationS: t.durationS };
      if (t.kind === "soun" && !audio) audio = { codec: t.codec, channels: t.channels!, sampleRate: t.sampleRate! };
    }
    if (!video || video.frames < 1 || !(video.durationS > 0)) throw new MontageError("no_video", "This file has no video.");
    return { video, audio };
  } catch (e) {
    if (e instanceof MontageError) throw e;
    throw new MontageError("unreadable", "This file is not a readable MP4.");
  }
}

/** Why two clips cannot be joined without re-encoding, or null when they can. */
export function formatMismatch(a: ClipInfo, b: ClipInfo): string | null {
  if (a.video.codec !== b.video.codec || a.video.config !== b.video.config) return "the video format differs";
  if (a.video.width !== b.video.width || a.video.height !== b.video.height) return `the picture size differs (${a.video.width}×${a.video.height} and ${b.video.width}×${b.video.height})`;
  if (a.video.timescale !== b.video.timescale || a.video.frameDelta !== b.video.frameDelta) return "the frame rate differs";
  if (!a.audio || !b.audio) return "a clip has no audio";
  if (a.audio.codec !== b.audio.codec || a.audio.channels !== b.audio.channels || a.audio.sampleRate !== b.audio.sampleRate) return "the audio format differs";
  return null;
}
