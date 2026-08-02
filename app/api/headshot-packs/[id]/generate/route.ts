import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { isHeadshotRole } from "@/lib/headshot-pack";
import { isCommerceImageProviderConfigured, startCommerceImage } from "@/lib/commerce-image-provider";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isCommerceImageProviderConfigured()) return NextResponse.json({ error: "Headshot generation is not configured." }, { status: 503 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  if (body.role !== undefined && !isHeadshotRole(body.role)) return NextResponse.json({ error: "Unknown headshot look." }, { status: 400 });
  const service = createServiceClient();
  const { data: pack } = await service.from("headshot_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pack) return NextResponse.json({ error: "Headshot pack not found." }, { status: 404 });
  let query = service.from("headshot_pack_assets").select("*").eq("pack_id", id);
  query = body.role ? query.eq("role", body.role) : query.in("status", ["pending", "failed"]);
  const { data: assets, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load the headshot looks." }, { status: 500 });
  let started = 0; let failed = 0;
  for (const asset of assets ?? []) {
    try {
      const taskId = await startCommerceImage({ prompt: asset.prompt, images: pack.source_images ?? [] });
      const { error: updateError } = await service.from("headshot_pack_assets").update({
        status: "processing", provider_task_id: taskId, image_url: null, error_message: null, attempt: (asset.attempt ?? 0) + 1,
      }).eq("id", asset.id).eq("pack_id", id);
      if (updateError) throw updateError;
      started += 1;
    } catch (error) {
      console.error("headshot generation start:", error);
      failed += 1;
      await service.from("headshot_pack_assets").update({ status: "failed", error_message: "Could not start this headshot." }).eq("id", asset.id);
    }
  }
  await service.from("headshot_packs").update({ status: started ? "processing" : failed ? "failed" : pack.status }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ started, failed });
}
