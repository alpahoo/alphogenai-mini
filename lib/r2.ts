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
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
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
