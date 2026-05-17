/**
 * R2 upload utility — shared between upload route and EvoLink completion handler.
 * Uses Cloudflare R2 via AWS S3-compatible API.
 *
 * Env vars (must be set in Vercel):
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET_NAME, R2_PUBLIC_URL
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function getS3Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    const missing = [
      !endpoint && "R2_ENDPOINT",
      !accessKeyId && "R2_ACCESS_KEY_ID",
      !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    ].filter(Boolean).join(", ");
    throw new Error(`R2 not configured — missing env vars: ${missing}`);
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Upload a Buffer to R2 and return the public URL.
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  key: string,
  contentType = "video/mp4"
): Promise<string> {
  const s3 = getS3Client();

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "alphogenai-assets",
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicBase = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  return `${publicBase}/${key}`;
}

/**
 * Download a video from a URL and upload it to R2.
 * Returns the permanent R2 public URL.
 */
export async function downloadAndUploadToR2(
  sourceUrl: string,
  destKey: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to download video from ${sourceUrl}: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error(`Downloaded video suspiciously small (${buffer.length} bytes)`);
  }

  return uploadBufferToR2(buffer, destKey, "video/mp4");
}

// ---------------------------------------------------------------------------
// Multi-Reference V1 — signed URL helper for the PRIVATE Supabase Storage
// bucket `references`.
//
// NOTE: This is a separate storage backend from R2. The helper lives in this
// file (rather than a new module) per the "no new module" constraint of the
// V1 brief. Despite the file name, this helper does NOT use R2 — it uses
// the Supabase Storage SDK with the service-role client.
//
// Per future-proof-notes §3.8: always store the storage path as source of
// truth, never store the signed URL. Sign on-demand just before the consumer
// (e.g. external video provider) needs to fetch the file.
// ---------------------------------------------------------------------------

/**
 * Mint a temporary signed URL for a file in the private `references` bucket.
 *
 * @param path         Storage path under bucket root, e.g.
 *                     "<user_id>/<job_id>/<uuid>.png"
 * @param ttlSeconds   URL validity in seconds (default 6h = 21600)
 * @returns            Signed URL valid for `ttlSeconds`. NEVER persist to DB.
 * @throws             If Supabase env vars are missing or signing fails.
 */
export async function signReferenceUrl(
  path: string,
  ttlSeconds = 21600,
): Promise<string> {
  // Lazy import to avoid loading the Supabase service client in code paths
  // (browser bundles) that only need the R2 helpers above.
  const { createServiceClient } = await import("@/lib/supabase/service");
  const supabase = createServiceClient();
  const { data, error } = await supabase.storage
    .from("references")
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(
      `signReferenceUrl failed for path=${path}: ${error?.message ?? "no signedUrl in response"}`,
    );
  }
  return data.signedUrl;
}
