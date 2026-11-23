import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { buildHeadshotPrompts, HEADSHOT_ROLES, validateHeadshotInput } from "@/lib/headshot-pack";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient().from("headshot_packs").select("*, headshot_pack_assets(*)")
    .eq("user_id", user.id).neq("status", "archived").order("created_at", { ascending: false }).limit(24);
  if (error) return NextResponse.json({ error: "Could not load your headshots." }, { status: 500 });
  return NextResponse.json({ packs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = validateHeadshotInput(await request.json().catch(() => null));
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const service = createServiceClient();
  const { data: pack, error: packError } = await service.from("headshot_packs").insert({
    user_id: user.id,
    title: input.name ? `${input.name} headshots` : "Professional headshots",
    subject_name: input.name ?? null,
    source_images: input.sourceImages,
    consent_confirmed_at: new Date().toISOString(),
    status: "draft",
  }).select().single();
  if (packError || !pack) return NextResponse.json({ error: "Could not create the headshot pack." }, { status: 500 });
  const prompts = buildHeadshotPrompts(input);
  const { data: assets, error } = await service.from("headshot_pack_assets")
    .insert(HEADSHOT_ROLES.map((role) => ({ pack_id: pack.id, role, prompt: prompts[role], status: "pending" }))).select();
  if (error) {
    await service.from("headshot_packs").delete().eq("id", pack.id);
    return NextResponse.json({ error: "Could not prepare the headshot looks." }, { status: 500 });
  }
  return NextResponse.json({ pack: { ...pack, headshot_pack_assets: assets ?? [] } }, { status: 201 });
}
