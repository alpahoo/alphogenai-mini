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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = getSupabaseService()
      .from("research_watchlists")
      .select("id, name, topic, url, mode, status, last_checked_at, last_changed_at, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (status === "active" || status === "paused") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.error("GET /api/research/watchlists:", error);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    return NextResponse.json({ watchlists: data ?? [] });
  } catch (err) {
    console.error("GET /api/research/watchlists:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const normalized = normalizeWatchlistWrite(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const { data, error } = await getSupabaseService()
      .from("research_watchlists")
      .insert({ ...normalized.value, user_id: userId })
      .select()
      .single();

    if (error) {
      console.error("POST /api/research/watchlists:", error);
      return NextResponse.json({ error: "Failed to create watchlist" }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/research/watchlists:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
