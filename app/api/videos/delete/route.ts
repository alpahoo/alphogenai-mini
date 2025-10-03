import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type DeleteInput = { id?: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as DeleteInput;
    const id = (body?.id ?? "").toString();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("videos")
      .select("id, video_url")
      .eq("id", id)
      .single();
    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (row.video_url) {
      const { error: delErr } = await supabase.storage.from("videos").remove([row.video_url]);
      if (delErr) {
        console.error("Storage delete error:", delErr);
      }
    }

    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("/api/videos/delete failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

