import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { isCommerceRole } from "@/lib/commerce-pack";
import { isCommerceImageProviderConfigured, startCommerceImage } from "@/lib/commerce-image-provider";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isCommerceImageProviderConfigured()) {
    return NextResponse.json({ error: "Image generation is not configured." }, { status: 503 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (body.role !== undefined && !isCommerceRole(body.role)) {
    return NextResponse.json({ error: "Unknown pack visual." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: pack } = await service.from("commerce_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pack) return NextResponse.json({ error: "Pack not found." }, { status: 404 });

  let query = service.from("commerce_pack_assets").select("*").eq("pack_id", id);
  if (body.role) query = query.eq("role", body.role);
  else query = query.in("status", ["pending", "failed"]);
  const { data: assets, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load pack visuals." }, { status: 500 });

  let started = 0;
  let failed = 0;
  for (const asset of assets ?? []) {
    try {
      const taskId = await startCommerceImage({ prompt: asset.prompt, images: pack.source_images ?? [] });
      const { error: updateError } = await service.from("commerce_pack_assets").update({
        status: "processing",
        provider_task_id: taskId,
        image_url: null,
        error_message: null,
        attempt: (asset.attempt ?? 0) + 1,
      }).eq("id", asset.id).eq("pack_id", id);
      if (updateError) throw updateError;
      started += 1;
    } catch (startError) {
      failed += 1;
      console.error("commerce image start:", startError);
      await service.from("commerce_pack_assets").update({ status: "failed", error_message: "Could not start this visual." }).eq("id", asset.id);
    }
  }

  await service.from("commerce_packs").update({
    status: started > 0 ? "processing" : failed > 0 ? "failed" : pack.status,
    error_message: failed > 0 ? "One or more visuals could not be started." : null,
  }).eq("id", id).eq("user_id", user.id);

  return NextResponse.json({ started, failed });
}
