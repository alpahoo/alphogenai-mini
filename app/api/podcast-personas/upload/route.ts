import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { fromBuffer as detectFromBuffer } from "file-type";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

/**
 * POST /api/podcast-personas/upload (T-1138)
 *
 * Uploads a persona portrait to the PRIVATE `podcast-personas` bucket at
 * `{user_id}/{uuid}.{ext}` and returns the storage path. The caller then creates
 * the persona via POST /api/podcast-personas with source_kind='uploaded',
 * consent:true and this portrait_path.
 *
 * Image-only (jpeg/png/webp), magic-bytes-validated, ≤10 MB. Bearer auth; the
 * path is always scoped to the verified user (ownership strict). Never accepts an
 * external URL — bytes only.
 */
export const maxDuration = 30;

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (matches bucket file_size_limit)
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const UNSUPPORTED_MSG = "Persona portraits support JPG, PNG, and WEBP only.";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 400 });
    }
    if (!MIME_TO_EXT[file.type]) {
      return NextResponse.json({ error: UNSUPPORTED_MSG }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Magic-bytes check: the real content must match an allowed image type
    // (don't trust the declared MIME).
    const detected = await detectFromBuffer(buffer);
    if (!detected || !MIME_TO_EXT[detected.mime]) {
      return NextResponse.json({ error: UNSUPPORTED_MSG }, { status: 400 });
    }
    const ext = MIME_TO_EXT[detected.mime];

    const path = `${user.id}/${randomUUID()}.${ext}`;
    const service = createServiceClient();
    const { error } = await service.storage
      .from("podcast-personas")
      .upload(path, buffer, { contentType: detected.mime, upsert: false });
    if (error) {
      console.error("[podcast-personas/upload] storage upload failed:", error);
      return NextResponse.json({ error: "Could not store the portrait" }, { status: 500 });
    }

    // Return the storage path; the persona row is created via POST
    // /api/podcast-personas (with consent). No public URL is minted here.
    return NextResponse.json({ storage_path: path });
  } catch (err) {
    console.error("POST /api/podcast-personas/upload:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
