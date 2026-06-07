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
    .select("id, asset_id, group_id, name, thumb_path, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mint fresh signed thumbnail URLs (the stored path is the source of truth;
  // signed URLs are short-lived so we regenerate on each read).
  const assets = await Promise.all(
    (data ?? []).map(async (a) => {
      let thumb_url: string | null = null;
      if (a.thumb_path) {
        const { data: signed } = await supabase.storage
          .from("references")
          .createSignedUrl(a.thumb_path, 86400);
        thumb_url = signed?.signedUrl ?? null;
      }
      return { ...a, thumb_url };
    }),
  );

  return NextResponse.json({ assets });
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
  // Display photo (storage path in the `references` bucket). Optional.
  const thumbPath = typeof body.thumb_path === "string" ? body.thumb_path.trim() : null;

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
      {
        user_id: user.id,
        asset_id: assetId,
        group_id: groupId,
        name: name || assetId,
        ...(thumbPath && { thumb_path: thumbPath }),
      },
      { onConflict: "user_id,asset_id" }
    )
    .select("id, asset_id, group_id, name, thumb_path, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let thumb_url: string | null = null;
  if (data?.thumb_path) {
    const { data: signed } = await supabase.storage
      .from("references")
      .createSignedUrl(data.thumb_path, 86400);
    thumb_url = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ asset: { ...data, thumb_url } });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, string> = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 80);
  if (typeof body.thumb_path === "string") patch.thumb_path = body.thumb_path.trim();
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("byteplus_assets")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, asset_id, group_id, name, thumb_path, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let thumb_url: string | null = null;
  if (data?.thumb_path) {
    const { data: signed } = await supabase.storage
      .from("references")
      .createSignedUrl(data.thumb_path, 86400);
    thumb_url = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ asset: { ...data, thumb_url } });
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
