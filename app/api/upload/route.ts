import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const MAX_SIZE_IMAGE = 10 * 1024 * 1024; // 10MB
const MAX_SIZE_VIDEO = 50 * 1024 * 1024; // 50MB
const MAX_SIZE_AUDIO = 20 * 1024 * 1024; // 20MB

const ALLOWED_TYPES: Record<string, { maxSize: number; folder: string }> = {
  "image/jpeg": { maxSize: MAX_SIZE_IMAGE, folder: "images" },
  "image/png": { maxSize: MAX_SIZE_IMAGE, folder: "images" },
  "image/webp": { maxSize: MAX_SIZE_IMAGE, folder: "images" },
  "video/mp4": { maxSize: MAX_SIZE_VIDEO, folder: "videos" },
  "video/quicktime": { maxSize: MAX_SIZE_VIDEO, folder: "videos" },
  "video/webm": { maxSize: MAX_SIZE_VIDEO, folder: "videos" },
  "audio/mpeg": { maxSize: MAX_SIZE_AUDIO, folder: "audio" },
  "audio/mp3": { maxSize: MAX_SIZE_AUDIO, folder: "audio" },
  "audio/wav": { maxSize: MAX_SIZE_AUDIO, folder: "audio" },
  "audio/x-wav": { maxSize: MAX_SIZE_AUDIO, folder: "audio" },
  "audio/mp4": { maxSize: MAX_SIZE_AUDIO, folder: "audio" },
};

/**
 * POST /api/upload — Upload a file to R2 (images, videos, audio)
 * Supports: I2V first frame, multi-reference media
 * Accepts: multipart/form-data with "file" field
 * Returns: { url: string }
 */
export async function POST(req: Request) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate type
    const typeConfig = ALLOWED_TYPES[file.type];
    if (!typeConfig) {
      return NextResponse.json(
        { error: `Invalid file type '${file.type}'. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}` },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > typeConfig.maxSize) {
      return NextResponse.json(
        { error: `File too large. Max for ${typeConfig.folder}: ${typeConfig.maxSize / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to R2
    const extMap: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
      "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
      "audio/x-wav": "wav", "audio/mp4": "m4a",
    };
    const ext = extMap[file.type] || file.type.split("/")[1];
    const key = `${typeConfig.folder}/${uuidv4()}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

    const s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || "alphogenai-assets",
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: file.type,
      })
    );

    const publicUrl = `${(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "")}/${key}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
