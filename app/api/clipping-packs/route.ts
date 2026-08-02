import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { clippingExtension, validateClippingPrepare } from "@/lib/clipping-pack";
import { triggerCreateShorts } from "@/lib/modal-client";

const SELECT = "*, clipping_pack_clips(*)";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient().from("clipping_packs").select(SELECT)
    .eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: "Could not load your Shorts." }, { status: 500 });
  return NextResponse.json({ packs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action;
  const service = createServiceClient();

  if (action === "prepare") {
    const parsed = validateClippingPrepare(body);
    if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const id = randomUUID();
    const path = `${user.id}/${id}/source.${clippingExtension(parsed.value.mime)}`;
    const { data: pack, error } = await service.from("clipping_packs").insert({
      id, user_id: user.id, title: parsed.value.title, source_path: path,
      source_mime: parsed.value.mime, source_size_bytes: parsed.value.size,
      clip_count: parsed.value.clipCount, status: "uploading",
    }).select().single();
    if (error || !pack) return NextResponse.json({ error: "Could not prepare this video." }, { status: 500 });
    const signed = await service.storage.from("clipping-sources").createSignedUploadUrl(path, { upsert: false });
    if (signed.error || !signed.data?.token) {
      await service.from("clipping_packs").delete().eq("id", id).eq("user_id", user.id);
      return NextResponse.json({ error: "Could not prepare the private upload." }, { status: 500 });
    }
    return NextResponse.json({ pack, upload: { bucket: "clipping-sources", path, token: signed.data.token } }, { status: 201 });
  }

  if (action === "submit") {
    const id = typeof body?.pack_id === "string" ? body.pack_id : "";
    const { data: pack } = await service.from("clipping_packs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (!pack) return NextResponse.json({ error: "Clipping project not found." }, { status: 404 });
    if (pack.status !== "uploading") return NextResponse.json({ pack, reused: true });
    const objects = await service.storage.from("clipping-sources").list(`${user.id}/${id}`, { limit: 10 });
    if (objects.error || !objects.data?.some((item) => `${user.id}/${id}/${item.name}` === pack.source_path)) {
      return NextResponse.json({ error: "The video upload is not complete yet." }, { status: 409 });
    }
    const { error } = await service.from("clipping_packs").update({ status: "queued", error_message: null }).eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Could not queue the Shorts." }, { status: 500 });
    try { await triggerCreateShorts(id); }
    catch (cause) {
      console.error("clipping trigger:", cause);
      await service.from("clipping_packs").update({ status: "failed", error_message: "The clipping worker could not start." }).eq("id", id);
      return NextResponse.json({ error: "The clipping worker could not start." }, { status: 502 });
    }
    return NextResponse.json({ pack: { ...pack, status: "queued" } });
  }
  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
