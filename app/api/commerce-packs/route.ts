import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { buildCommercePrompts, COMMERCE_ROLES, validateCommerceInput } from "@/lib/commerce-pack";

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await createServiceClient()
    .from("commerce_packs")
    .select("*, commerce_pack_assets(*)")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    console.error("GET /api/commerce-packs:", error);
    return NextResponse.json({ error: "Could not load your packs." }, { status: 500 });
  }
  return NextResponse.json({ packs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = validateCommerceInput(await request.json().catch(() => null));
  if (!parsed.value) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;
  const service = createServiceClient();
  const { data: pack, error: packError } = await service
    .from("commerce_packs")
    .insert({
      user_id: user.id,
      marketplace: "amazon",
      title: `${input.productName} Amazon pack`,
      product_name: input.productName,
      category: input.category,
      target_buyer: input.targetBuyer ?? null,
      source_url: input.sourceUrl ?? null,
      source_images: input.sourceImages,
      verified_features: input.verifiedFeatures,
      preset: input.preset,
      status: "draft",
    })
    .select()
    .single();

  if (packError || !pack) {
    console.error("POST /api/commerce-packs pack:", packError);
    return NextResponse.json({ error: "Could not create the Amazon pack." }, { status: 500 });
  }

  const prompts = buildCommercePrompts(input);
  const { data: assets, error: assetsError } = await service
    .from("commerce_pack_assets")
    .insert(COMMERCE_ROLES.map((role) => ({ pack_id: pack.id, role, status: "pending", prompt: prompts[role] })))
    .select();

  if (assetsError) {
    await service.from("commerce_packs").delete().eq("id", pack.id);
    console.error("POST /api/commerce-packs assets:", assetsError);
    return NextResponse.json({ error: "Could not prepare the four pack visuals." }, { status: 500 });
  }
  return NextResponse.json({ pack: { ...pack, commerce_pack_assets: assets ?? [] } }, { status: 201 });
}
