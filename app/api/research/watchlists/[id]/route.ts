import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { normalizeWatchlistWrite } from "@/lib/research/watchlists";

function getSupabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getSupabaseAuth() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function getUserId(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const { data: { user }, error } = await getSupabaseAuth().auth.getUser(authHeader.substring(7));
  if (error || !user) return null;
  return user.id;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const normalized = normalizeWatchlistWrite(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const { data, error } = await getSupabaseService()
      .from("research_watchlists")
      .update(normalized.value)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Watchlist not found" }, { status: 404 });
      }
      console.error("PATCH /api/research/watchlists/[id]:", error);
      return NextResponse.json({ error: "Failed to update watchlist" }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("PATCH /api/research/watchlists/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const { error } = await getSupabaseService()
      .from("research_watchlists")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("DELETE /api/research/watchlists/[id]:", error);
      return NextResponse.json({ error: "Failed to delete watchlist" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/research/watchlists/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
