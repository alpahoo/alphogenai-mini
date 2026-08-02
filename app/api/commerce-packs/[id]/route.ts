import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { addFeaturePanel } from "@/lib/commerce-feature-panel";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { derivePackStatus } from "@/lib/commerce-pack";
import { pollCommerceImage } from "@/lib/commerce-image-provider";
import { uploadBufferToR2 } from "@/lib/r2";

type Context = { params: Promise<{ id: string }> };

async function persistImage(sourceUrl: string, packId: string, role: string, pack: Record<string, unknown>) {
  const sharp = (await import("sharp")).default;
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Generated image download failed (${response.status}).`);
  const downloaded = Buffer.from(await response.arrayBuffer());
  if (downloaded.length < 1_000) throw new Error("Generated image was unexpectedly small.");
  const finalImage = role === "feature"
    ? await addFeaturePanel(downloaded, String(pack.product_name ?? "Product"), Array.isArray(pack.verified_features) ? pack.verified_features.map(String) : [])
    : await sharp(downloaded).jpeg({ quality: 92 }).toBuffer();
  return uploadBufferToR2(finalImage, `commerce/amazon/${packId}/${role}-${randomUUID()}.jpg`, "image/jpeg");
}

export async function GET(request: NextRequest, context: Context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const service = createServiceClient();
  const { data: pack } = await service.from("commerce_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pack) return NextResponse.json({ error: "Pack not found." }, { status: 404 });

  const { data: assets, error } = await service.from("commerce_pack_assets").select("*").eq("pack_id", id).order("created_at");
  if (error) return NextResponse.json({ error: "Could not load pack visuals." }, { status: 500 });

  for (const asset of assets ?? []) {
    if (asset.status !== "processing" || !asset.provider_task_id) continue;
    try {
      const result = await pollCommerceImage(asset.provider_task_id);
      if (result.status === "processing") continue;
      if (result.status === "failed") {
        await service.from("commerce_pack_assets").update({ status: "failed", error_message: result.error }).eq("id", asset.id);
      } else {
        const imageUrl = await persistImage(result.url, id, asset.role, pack);
        await service.from("commerce_pack_assets").update({ status: "ready", image_url: imageUrl, error_message: null }).eq("id", asset.id);
      }
    } catch (pollError) {
      console.error("commerce image poll:", pollError);
    }
  }

  const { data: currentAssets } = await service.from("commerce_pack_assets").select("*").eq("pack_id", id).order("created_at");
  const status = derivePackStatus((currentAssets ?? []).map((asset) => asset.status));
  if (status !== pack.status) await service.from("commerce_packs").update({ status, error_message: null }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ pack: { ...pack, status, commerce_pack_assets: currentAssets ?? [] } });
}
