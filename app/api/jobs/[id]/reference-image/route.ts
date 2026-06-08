import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer as detectFromBuffer } from "file-type";
import {
  REFERENCE_IMAGE_ALLOWED_MIME,
  buildJobReferenceItem,
  buildJobReferenceStoragePath,
  pickJobReferenceImageSource,
} from "@/lib/job-reference-image";

const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/jobs/[id]/reference-image
 *
 * Converts the best still image from a completed job into a structured create-flow
 * reference. The route copies the image into the private references bucket and
 * returns a ReferenceItem-compatible object. V1 is image-only by design.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Job ID is required" }, { status: 400 });

    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: job } = await supabase
      .from("jobs")
      .select("id, user_id, status, image_url, social_exports")
      .eq("id", id)
      .single();

    if (!job || job.user_id !== user.id) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status !== "done") {
      return NextResponse.json({ error: "Only completed jobs can be used as a reference" }, { status: 400 });
    }

    const { data: firstScene } = await supabase
      .from("job_scenes")
      .select("last_frame_url")
      .eq("job_id", id)
      .eq("scene_index", 0)
      .single();

    let source = pickJobReferenceImageSource({
      job: {
        id: job.id as string,
        image_url: job.image_url as string | null,
        social_exports: job.social_exports as Record<string, unknown> | null,
      },
      firstScene: firstScene as { last_frame_url?: string | null } | null,
      r2PublicUrl: process.env.R2_PUBLIC_URL,
    });

    if (source?.kind === "r2_frame") {
      try {
        const probe = await fetch(source.url, { method: "HEAD" });
        if (!probe.ok) source = null;
      } catch {
        source = null;
      }
    }

    if (!source) {
      return NextResponse.json(
        { error: "No image reference is available for this job yet" },
        { status: 404 },
      );
    }

    const imageRes = await fetch(source.url, { signal: AbortSignal.timeout(15_000) });
    if (!imageRes.ok) {
      return NextResponse.json({ error: "Could not download reference image" }, { status: 502 });
    }

    const buffer = Buffer.from(await imageRes.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_REFERENCE_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Reference image is empty or too large" },
        { status: 400 },
      );
    }

    const detected = await detectFromBuffer(buffer);
    if (!detected || !REFERENCE_IMAGE_ALLOWED_MIME.has(detected.mime)) {
      return NextResponse.json(
        { error: "Selected job image is not a supported reference image" },
        { status: 415 },
      );
    }

    const storagePath = buildJobReferenceStoragePath(user.id, id, uuidv4(), detected.mime);
    const { error: uploadError } = await supabase.storage
      .from("references")
      .upload(storagePath, buffer, {
        contentType: detected.mime,
        upsert: false,
      });

    if (uploadError) {
      console.error("[reference-image] Storage upload failed:", uploadError.message);
      return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("references")
      .createSignedUrl(storagePath, 21600);

    if (signError || !signed?.signedUrl) {
      console.error("[reference-image] Signed URL failed:", signError?.message ?? "no signedUrl");
      return NextResponse.json({ error: "Signed URL generation failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      source: source.kind,
      reference: buildJobReferenceItem({
        signedUrl: signed.signedUrl,
        storagePath,
        mime: detected.mime,
        sourceKind: source.kind,
      }),
    });
  } catch (error) {
    console.error("[reference-image] Error:", error);
    return NextResponse.json({ error: "Could not prepare a reference from this video yet" }, { status: 500 });
  }
}
