/**
 * Makes a reference image fit under the hosting platform's request-body limit before it is uploaded.
 *
 * Vercel serverless functions refuse a request body above 4.5 MB (4,718,592 bytes) with a 413 before our route
 * runs, so a 4.8 MB PNG failed even though the route and the bucket allow 10 MB. The picture is resized in the
 * browser instead: only when the file is above the budget, never enlarged, in the same format (a PNG stays a PNG,
 * a lossy format is re-encoded at high quality), keeping the aspect ratio. A workflow renders a few hundred pixels
 * (H3: 480 x 832), so a reference of about 1000 to 2000 pixels on its long edge loses nothing it could use.
 *
 * The planning and the ladder are pure and tested with a fake codec. The browser codec is the default.
 */

/** Budget for one upload: under 4.5 MB with room for the multipart envelope. */
export const UPLOAD_BUDGET_BYTES = 4_000_000;
/** The hosting limit, for messages. */
export const HOST_LIMIT_LABEL = "4.5 MB";
/** The largest original accepted in the browser before resizing. */
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Decoding guard: very large pictures are refused instead of exhausting the tab's memory. */
export const MAX_INPUT_PIXELS = 100_000_000;
/** Resizing stops here: below this the picture would be too small to be a useful reference. */
export const MIN_LONG_EDGE = 1024;
/** Successive scale factors tried, never above 1 (no enlargement). */
export const SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.45] as const;
const LOSSY_QUALITY = 0.92;
const FITTABLE = ["image/png", "image/jpeg", "image/webp"];

export interface Decoded { width: number; height: number; source: unknown }
export interface Codec {
  decode(file: Blob): Promise<Decoded>;
  encode(source: unknown, width: number, height: number, type: string, quality?: number): Promise<Blob>;
  release?(source: unknown): void;
}

export class FitError extends Error {}

export interface FitResult {
  file: File;
  resized: boolean;
  /** One sentence for the administrator when the picture was reduced, otherwise null. */
  note: string | null;
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export function resizeNote(from: { bytes: number; width: number; height: number }, to: { bytes: number; width: number; height: number }): string {
  return `Resized to fit the ${HOST_LIMIT_LABEL} upload limit: ${from.width} × ${from.height} (${mb(from.bytes)}) → ${to.width} × ${to.height} (${mb(to.bytes)}).`;
}

/** Message for a failed upload. A 413 comes from the hosting platform and has no JSON body of ours. */
export function uploadFailureMessage(status: number, serverError?: string | null, fallback = "Upload failed"): string {
  if (status === 413) return `The image is larger than the ${HOST_LIMIT_LABEL} upload limit. Use a smaller image.`;
  return serverError || fallback;
}

export async function fitImage(file: File, opts: { budget?: number; codec?: Codec } = {}): Promise<FitResult> {
  const budget = opts.budget ?? UPLOAD_BUDGET_BYTES;
  if (!FITTABLE.includes(file.type)) throw new FitError("Use a PNG, JPEG or WebP image.");
  if (file.size <= budget) return { file, resized: false, note: null };
  if (file.size > MAX_INPUT_BYTES) throw new FitError(`Image must be ${MAX_INPUT_BYTES / 1024 / 1024} MB or less.`);

  const codec = opts.codec ?? browserCodec();
  const decoded = await codec.decode(file).catch(() => { throw new FitError("This image could not be read."); });
  try {
    const { width, height } = decoded;
    if (!(width > 0 && height > 0) || width * height > MAX_INPUT_PIXELS) throw new FitError("This image is too large to resize here. Use a smaller image.");
    const lossy = file.type !== "image/png";
    for (const scale of SCALE_STEPS) {
      const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
      if (scale < 1 && Math.max(w, h) < MIN_LONG_EDGE) break;
      // Same size again only helps a lossy format: a PNG re-encoded at its own size is not smaller.
      if (scale === 1 && !lossy) continue;
      const blob = await codec.encode(decoded.source, w, h, file.type, lossy ? LOSSY_QUALITY : undefined).catch(() => null);
      if (blob && blob.size > 0 && blob.size <= budget) {
        const fitted = new File([blob], file.name, { type: file.type });
        return { file: fitted, resized: true, note: resizeNote({ bytes: file.size, width, height }, { bytes: fitted.size, width: w, height: h }) };
      }
    }
    throw new FitError(`This image is still above the ${HOST_LIMIT_LABEL} upload limit after resizing. Use a smaller or more compressed image.`);
  } finally { codec.release?.(decoded.source); }
}

/** Browser implementation: createImageBitmap, then a canvas (OffscreenCanvas when available). */
export function browserCodec(): Codec {
  return {
    async decode(file) {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height, source: bitmap };
    },
    async encode(source, width, height, type, quality) {
      const bitmap = source as ImageBitmap;
      if (typeof OffscreenCanvas !== "undefined") {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no canvas");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type, quality });
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob>((ok, ko) => canvas.toBlob(b => (b ? ok(b) : ko(new Error("encode failed"))), type, quality));
    },
    release(source) { (source as ImageBitmap).close?.(); },
  };
}
