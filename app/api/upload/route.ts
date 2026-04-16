import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/upload — Upload an image to R2 for I2V (Image-to-Video)
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
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size: ${MAX_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Upload to R2
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `images/${uuidv4()}.${ext}`;
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
