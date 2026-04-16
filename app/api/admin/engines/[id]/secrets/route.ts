import { NextResponse } from "next/server";
import { requireAdmin } from "../../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";

/**
 * GET /api/admin/engines/[id]/secrets — List secret NAMES (not values)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("engine_secrets")
    .select("secret_name, created_at, updated_at")
    .eq("engine_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    secrets: (data ?? []).map((s) => ({
      name: s.secret_name,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })),
  });
}

/**
 * PUT /api/admin/engines/[id]/secrets — Rotate (upsert) a secret
 * Body: { name: "api_key", value: "sk_..." }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const body = await req.json();
  const { name, value } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Secret name required" }, { status: 400 });
  }
  if (!value || typeof value !== "string" || value.length < 3) {
    return NextResponse.json({ error: "Secret value required (min 3 chars)" }, { status: 400 });
  }

  try {
    const { encrypted, iv, authTag } = encryptSecret(value.trim());
    const supabase = createServiceClient();

    const { error } = await supabase.from("engine_secrets").upsert(
      {
        engine_id: id,
        secret_name: name,
        secret_value_encrypted: encrypted,
        iv,
        auth_tag: authTag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "engine_id,secret_name" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[admin] Secret rotated: ${id}/${name} by ${auth.user.email}`);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Encryption failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/engines/[id]/secrets?name=api_key — Remove a secret
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const url = new URL(req.url);
  const name = url.searchParams.get("name");

  if (!name) {
    return NextResponse.json({ error: "Secret name required (?name=...)" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("engine_secrets")
    .delete()
    .eq("engine_id", id)
    .eq("secret_name", name);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[admin] Secret deleted: ${id}/${name} by ${auth.user.email}`);
  return NextResponse.json({ success: true });
}
