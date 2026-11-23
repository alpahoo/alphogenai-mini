import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo must be smaller than 10 MB." }, { status: 400 });

    const input = Buffer.from(await file.arrayBuffer());
    const detected = await detectFromBuffer(input);
    if (!detected || !ALLOWED.has(detected.mime)) {
      return NextResponse.json({ error: "Use a JPG, PNG, or WEBP photo." }, { status: 400 });
    }

    const sharp = (await import("sharp")).default;
    const metadata = await sharp(input).metadata();
    if (!metadata.width || !metadata.height) return NextResponse.json({ error: "This photo could not be decoded." }, { status: 400 });
    if (metadata.width < 128 || metadata.height < 128) {
      return NextResponse.json({ error: "This photo is too small. Use an image at least 128 x 128 pixels." }, { status: 400 });
    }

    const normalized = await sharp(input)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: false })
      .toColourspace("srgb")
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const storagePath = `${user.id}/headshots/${uuidv4()}.jpg`;
    const { error: uploadError } = await supabase.storage.from("references").upload(storagePath, normalized, {
      contentType: "image/jpeg", upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: signed, error: signError } = await supabase.storage.from("references").createSignedUrl(storagePath, 21600);
    if (signError || !signed?.signedUrl) throw signError ?? new Error("Signed URL unavailable.");

    const lowResolution = metadata.width < 512 || metadata.height < 512;
    return NextResponse.json({
      url: signed.signedUrl,
      storage_path: storagePath,
      normalized: true,
      warning: lowResolution ? "This photo is low resolution. It can be used, but a larger original will preserve identity better." : null,
    });
  } catch (error) {
    console.error("headshot upload:", error);
    return NextResponse.json({ error: "Could not prepare this photo. Try another image." }, { status: 500 });
  }
}
