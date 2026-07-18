import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { fromBuffer as detectFromBuffer } from "file-type";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { screenPersonaName } from "@/lib/content-policy";
import {
  USER_PRESENTER_BUCKET,
  USER_PRESENTER_CONSENT_VERSION,
  toPublicPresenter,
  type UserPresenterRow,
} from "@/lib/user-presenters";

export const maxDuration = 30;

// Vercel rejects serverless request bodies above roughly 4.5 MB before this
// route runs. The client normalizes photos first; this guard keeps direct API
// callers below the platform limit too.
const MAX_SIZE = 4 * 1024 * 1024;
const MIN_DIMENSION = 512;
const SELECT =
  "id, user_id, name, portrait_path, thumb_path, image_sha256, external_avatar_id, external_task_id, status, error_message, created_at, updated_at";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const name = String(form?.get("name") ?? "").trim().slice(0, 120);
    const consent = form?.get("consent") === "true";
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Choose a portrait image." }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "Name your presenter." }, { status: 400 });
    if (!consent) {
      return NextResponse.json(
        { error: "You must confirm that you have permission to use this likeness." },
        { status: 400 },
      );
    }
    const screen = screenPersonaName(name);
    if (screen.blocked) {
      return NextResponse.json(
        { error: screen.findings[0]?.message ?? "This presenter name is not allowed." },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Image is too large (4 MB maximum)." }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    const detected = await detectFromBuffer(input);
    if (!detected || !ALLOWED_MIME.has(detected.mime)) {
      return NextResponse.json(
        { error: "Presenter portraits support JPG, PNG, and WEBP only." },
        { status: 400 },
      );
    }

    const metadata = await sharp(input).metadata().catch(() => null);
    if (
      !metadata?.width ||
      !metadata.height ||
      metadata.width < MIN_DIMENSION ||
      metadata.height < MIN_DIMENSION
    ) {
      return NextResponse.json(
        { error: "Use a clear portrait of at least 512 x 512 pixels." },
        { status: 400 },
      );
    }

    const normalized = await sharp(input)
      .rotate()
      .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    const sha256 = createHash("sha256").update(normalized).digest("hex");
    const service = createServiceClient();

    const { data: existing, error: existingError } = await service
      .from("user_presenters")
      .select(SELECT)
      .eq("user_id", user.id)
      .eq("image_sha256", sha256)
      .neq("status", "removed")
      .maybeSingle();
    if (existingError) {
      console.error("[presenters/upload] duplicate lookup failed:", existingError);
      return NextResponse.json({ error: "Could not check the portrait." }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({
        presenter: await toPublicPresenter(service, existing as UserPresenterRow),
        reused: true,
      });
    }

    const portraitPath = user.id + "/" + randomUUID() + ".jpg";
    const { error: uploadError } = await service.storage
      .from(USER_PRESENTER_BUCKET)
      .upload(portraitPath, normalized, { contentType: "image/jpeg", upsert: false });
    if (uploadError) {
      console.error("[presenters/upload] storage failed:", uploadError);
      return NextResponse.json({ error: "Could not store the portrait." }, { status: 500 });
    }

    const { data, error } = await service
      .from("user_presenters")
      .insert({
        user_id: user.id,
        name,
        portrait_path: portraitPath,
        image_sha256: sha256,
        status: "uploaded",
        consent_confirmed_at: new Date().toISOString(),
        consent_statement_version: USER_PRESENTER_CONSENT_VERSION,
      })
      .select(SELECT)
      .single();
    if (error || !data) {
      console.error("[presenters/upload] insert failed:", error);
      await service.storage.from(USER_PRESENTER_BUCKET).remove([portraitPath]);
      return NextResponse.json({ error: "Could not save the presenter." }, { status: 500 });
    }

    return NextResponse.json({
      presenter: await toPublicPresenter(service, data as UserPresenterRow),
      reused: false,
    });
  } catch (error) {
    console.error("POST /api/presenters/upload:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
