export interface JobReferenceImageJob {
  id: string;
  image_url?: string | null;
  social_exports?: Record<string, unknown> | null;
}

export interface JobReferenceImageScene {
  last_frame_url?: string | null;
}

export interface ReferenceImageSourceInput {
  job: JobReferenceImageJob;
  firstScene?: JobReferenceImageScene | null;
  r2PublicUrl?: string | null;
}

export type ReferenceImageSourceKind = "thumbnail" | "last_frame" | "image_url" | "r2_frame";

export interface ReferenceImageSource {
  kind: ReferenceImageSourceKind;
  url: string;
}

export const REFERENCE_IMAGE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const REFERENCE_IMAGE_ALLOWED_MIME = new Set(Object.keys(REFERENCE_IMAGE_MIME_TO_EXT));

function cleanUrl(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function pickJobReferenceImageSource({
  job,
  firstScene,
  r2PublicUrl,
}: ReferenceImageSourceInput): ReferenceImageSource | null {
  const thumbnail = cleanUrl(job.social_exports?.thumbnail);
  if (thumbnail) return { kind: "thumbnail", url: thumbnail };

  const lastFrame = cleanUrl(firstScene?.last_frame_url);
  if (lastFrame) return { kind: "last_frame", url: lastFrame };

  const imageUrl = cleanUrl(job.image_url);
  if (imageUrl) return { kind: "image_url", url: imageUrl };

  const r2Base = cleanUrl(r2PublicUrl)?.replace(/\/+$/, "");
  if (r2Base) return { kind: "r2_frame", url: `${r2Base}/frames/${job.id}_scene_00_last.jpg` };

  return null;
}

export function buildJobReferenceStoragePath(userId: string, jobId: string, id: string, mime: string): string {
  const ext = REFERENCE_IMAGE_MIME_TO_EXT[mime];
  if (!ext) throw new Error(`Unsupported reference image MIME: ${mime}`);
  return `${userId}/job-refs/${jobId}-${id}.${ext}`;
}

export function buildJobReferenceItem(input: {
  signedUrl: string;
  storagePath: string;
  mime: string;
  sourceKind: ReferenceImageSourceKind;
}) {
  return {
    role: "outfit_style" as const,
    url: input.signedUrl,
    storage_path: input.storagePath,
    mime_type: input.mime,
    filename: `job-reference-${input.sourceKind}.${REFERENCE_IMAGE_MIME_TO_EXT[input.mime]}`,
    weight: 0.7,
  };
}
