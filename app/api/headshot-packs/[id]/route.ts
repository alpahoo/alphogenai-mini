import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { deriveHeadshotPackStatus } from "@/lib/headshot-pack";
import { pollCommerceImage } from "@/lib/commerce-image-provider";
import { uploadBufferToR2 } from "@/lib/r2";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const service = createServiceClient();
  const { data: pack } = await service.from("headshot_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pack) return NextResponse.json({ error: "Headshot pack not found." }, { status: 404 });
  const { data: assets, error } = await service.from("headshot_pack_assets").select("*").eq("pack_id", id).order("created_at");
  if (error) return NextResponse.json({ error: "Could not load the headshots." }, { status: 500 });
  for (const asset of assets ?? []) {
    if (asset.status !== "processing" || !asset.provider_task_id) continue;
    try {
      const result = await pollCommerceImage(asset.provider_task_id);
      if (result.status === "processing") continue;
      if (result.status === "failed") {
        await service.from("headshot_pack_assets").update({ status: "failed", error_message: result.error }).eq("id", asset.id);
      } else {
        const response = await fetch(result.url, { signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error("Headshot download failed.");
        const sharp = (await import("sharp")).default;
        const image = await sharp(Buffer.from(await response.arrayBuffer())).resize(1400, 1400, { fit: "cover" }).jpeg({ quality: 94 }).toBuffer();
        const imageUrl = await uploadBufferToR2(image, `headshots/${user.id}/${id}/${asset.role}-${randomUUID()}.jpg`, "image/jpeg");
        await service.from("headshot_pack_assets").update({ status: "ready", image_url: imageUrl, error_message: null }).eq("id", asset.id);
      }
    } catch (error) { console.error("headshot poll:", error); }
  }
  const { data: current } = await service.from("headshot_pack_assets").select("*").eq("pack_id", id).order("created_at");
  const status = deriveHeadshotPackStatus((current ?? []).map((asset) => asset.status));
  if (status !== pack.status) await service.from("headshot_packs").update({ status, error_message: null }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ pack: { ...pack, status, headshot_pack_assets: current ?? [] } });
}
