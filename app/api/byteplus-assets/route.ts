// User's BytePlus verified real-human face assets (asset://<asset_id>).
// These are created/verified in the BytePlus console; AlphoGen just stores the
// approved Asset IDs per user and references them in Seedance 2.0 generation.
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("byteplus_assets")
    .select("id, asset_id, group_id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assetId = typeof body.asset_id === "string" ? body.asset_id.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const groupId = typeof body.group_id === "string" ? body.group_id.trim() : null;

  // Basic shape check — BytePlus asset ids look like "asset-YYYYMMDD...".
  if (!assetId || !/^asset-/.test(assetId)) {
    return NextResponse.json(
      { error: "A valid BytePlus Asset ID (asset-...) is required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("byteplus_assets")
    .upsert(
      { user_id: user.id, asset_id: assetId, group_id: groupId, name: name || assetId },
      { onConflict: "user_id,asset_id" }
    )
    .select("id, asset_id, group_id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("byteplus_assets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
