import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("videos")
      .select("id, idea, script, hashtags, description, video_url, status, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ videos: data ?? [] });
  } catch (error) {
    console.error("/api/videos/list failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

