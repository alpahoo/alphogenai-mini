import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * PATCH /api/looks/[id] — Rename a saved Look.
 * DELETE /api/looks/[id] — Remove a saved Look (alternative to query param endpoint).
 */

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name } = body as { name?: string };

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "name is required and must be a string" },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 100) {
    return NextResponse.json(
      { error: "name must be between 1 and 100 characters" },
      { status: 400 }
    );
  }

  const svc = createServiceClient();
  const { data: look, error: updateErr } = await svc
    .from("cinematic_looks")
    .update({ name: trimmedName, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, updated_at")
    .single();

  if (updateErr) {
    if (updateErr.code === "PGRST116") {
      return NextResponse.json({ error: "Look not found" }, { status: 404 });
    }
    console.error("[looks] patch failed:", updateErr.message);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  console.log(`[looks] renamed look ${id} for user=${user.id}`);
  return NextResponse.json({ success: true, look });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { error: deleteErr } = await svc
    .from("cinematic_looks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (deleteErr) {
    console.error("[looks] delete failed:", deleteErr.message);
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  console.log(`[looks] deleted look ${id} for user=${user.id}`);
  return NextResponse.json({ success: true });
}
