import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";

// ---------------------------------------------------------------------------
// Legacy R2 upload — used for I2V first frame, audio/video assets, etc.
// Unchanged behaviour. Triggered when the request has NO `?bucket=...` query
// param (or any value other than "references").
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// V1 Étape A — references private bucket (Supabase Storage)
// Image-only for V1 (bucket allowed_mime_types = image/jpeg|png|webp).
// Triggered when `?bucket=references`. Validates magic bytes via file-type.
// Returns { url: signedUrl, storage_path: "<user_id>/<uuid>.<ext>" }.
// ---------------------------------------------------------------------------

const MAX_SIZE_REFERENCE = 10 * 1024 * 1024; // 10 MB (matches bucket file_size_limit)

const REFERENCE_ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const REFERENCE_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const REFERENCE_UNSUPPORTED_MSG =
  "Reference uploads currently support JPG, PNG, and WEBP only.";

/**
 * POST /api/upload
 *
 * Two routing modes:
 *   - default: legacy R2 public upload (images, videos, audio) — UNCHANGED
 *   - ?bucket=references: V1 Étape A — Supabase Storage private bucket
 *     `references`, image-only (jpeg/png/webp), magic-bytes-validated,
 *     returns { url (6h signed), storage_path }.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const bucket = url.searchParams.get("bucket");

  if (bucket === "references") {
    return uploadToReferencesBucket(req);
  }
  return uploadToR2Legacy(req);
}

// ---------------------------------------------------------------------------
// Legacy R2 path — verbatim from previous implementation, body unchanged.
// ---------------------------------------------------------------------------

async function uploadToR2Legacy(req: Request): Promise<NextResponse> {
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

// ---------------------------------------------------------------------------
// V1 references bucket path — Supabase Storage, private, image-only.
// ---------------------------------------------------------------------------

async function uploadToReferencesBucket(req: Request): Promise<NextResponse> {
  try {
    // 1. Auth
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

    // 2. File present
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // 3. Size cap (bucket also enforces 10 MB at storage layer, defence in depth)
    if (file.size > MAX_SIZE_REFERENCE) {
      return NextResponse.json(
        {
          error: `File too large. Reference uploads max ${
            MAX_SIZE_REFERENCE / 1024 / 1024
          } MB.`,
        },
        { status: 400 }
      );
    }

    // 4. Read into buffer (needed for magic-byte detection and Supabase upload)
    const buffer = Buffer.from(await file.arrayBuffer());

    // 5. Magic-byte detection — never trust the extension or file.type alone
    const detected = await detectFromBuffer(buffer);
    if (!detected) {
      return NextResponse.json(
        { error: REFERENCE_UNSUPPORTED_MSG },
        { status: 400 }
      );
    }

    // 6. MIME whitelist
    if (!REFERENCE_ALLOWED_MIME.has(detected.mime)) {
      return NextResponse.json(
        { error: REFERENCE_UNSUPPORTED_MSG },
        { status: 400 }
      );
    }

    // 7. Soft consistency check between claimed type and detected magic bytes.
    //    `image/jpg` (some browsers/Safari) is treated as an alias of `image/jpeg`.
    if (file.type) {
      const claimed = file.type.toLowerCase();
      const real = detected.mime.toLowerCase();
      const isJpegAlias =
        (claimed === "image/jpg" || claimed === "image/jpeg") &&
        real === "image/jpeg";
      if (!isJpegAlias && claimed !== real) {
        return NextResponse.json(
          {
            error: `File type mismatch: claimed ${file.type}, detected ${detected.mime}.`,
          },
          { status: 400 }
        );
      }
    }

    // 8. Build storage path — uuid generated server-side, ext derived from
    //    detected MIME (never from filename). Path: `{user_id}/{uuid}.{ext}`.
    //    NOT prefixed by `references/` — that's the bucket name, not a folder.
    const ext = REFERENCE_MIME_TO_EXT[detected.mime];
    const storagePath = `${user.id}/${uuidv4()}.${ext}`;

    // 9. Upload via user-scoped client → RLS enforces folder isolation
    //    (defence in depth — path is server-built but policy double-checks).
    const { error: uploadError } = await supabase.storage
      .from("references")
      .upload(storagePath, buffer, {
        contentType: detected.mime,
        upsert: false,
      });

    if (uploadError) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "upload_references",
          event: "upload.failed",
          user_id: user.id,
          reason: uploadError.message,
        })
      );
      return NextResponse.json(
        { error: "Storage upload failed" },
        { status: 500 }
      );
    }

    // 10. Mint short-lived signed URL for UI preview (6 h TTL).
    //     This URL is NEVER persisted — it's just so the frontend can show
    //     a thumbnail right after upload. Source of truth is `storage_path`.
    const { data: signed, error: signError } = await supabase.storage
      .from("references")
      .createSignedUrl(storagePath, 21600);

    if (signError || !signed?.signedUrl) {
      console.error(
        JSON.stringify({
          level: "error",
          service: "upload_references",
          event: "sign.failed",
          user_id: user.id,
          reason: signError?.message ?? "no signedUrl in response",
        })
      );
      return NextResponse.json(
        { error: "Signed URL generation failed" },
        { status: 500 }
      );
    }

    // Structured success log — no signed URL, no filename, no PII beyond user_id
    console.info(
      JSON.stringify({
        level: "info",
        service: "upload_references",
        event: "upload.success",
        user_id: user.id,
        mime: detected.mime,
        size_bytes: buffer.length,
      })
    );

    return NextResponse.json({
      url: signed.signedUrl,
      storage_path: storagePath,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        service: "upload_references",
        event: "unexpected_error",
        reason: error instanceof Error ? error.message : String(error),
      })
    );
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
