import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GenerateVideoInput = { videoId?: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateVideoInput;
    const videoId = (body?.videoId ?? "").toString();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const { data: row, error: fetchErr } = await supabase
      .from("videos")
      .select("id, user_id, script")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();
    if (fetchErr || !row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Mark as generating
    await supabase.from("videos").update({ status: "generating" }).eq("id", videoId);

    const wanUrl = process.env.WAN_API_URL;
    const wanKey = process.env.WAN_API_KEY;
    if (!wanUrl || !wanKey) {
      return NextResponse.json({ error: "WAN API is not configured" }, { status: 500 });
    }

    const wanRes = await fetch(wanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wanKey}`,
      },
      body: JSON.stringify({ script: row.script, videoId }),
    });

    if (!wanRes.ok) {
      const txt = await wanRes.text();
      console.error("WAN API error:", wanRes.status, txt);
      await supabase.from("videos").update({ status: "error" }).eq("id", videoId);
      return NextResponse.json({ error: "Failed to generate video" }, { status: 502 });
    }

    // Attempt to read json or binary
    let videoBuffer: Buffer | null = null;
    try {
      const contentType = wanRes.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const j = await wanRes.json();
        const directUrl = j?.video_url || j?.result?.url;
        const base64 = j?.video_base64;
        if (typeof directUrl === "string") {
          const fileRes = await fetch(directUrl);
          const ab = await fileRes.arrayBuffer();
          videoBuffer = Buffer.from(ab);
        } else if (typeof base64 === "string") {
          videoBuffer = Buffer.from(base64, "base64");
        }
      } else if (contentType.includes("video")) {
        const ab = await wanRes.arrayBuffer();
        videoBuffer = Buffer.from(ab);
      }
    } catch (e) {
      console.error("WAN response parse error:", e);
    }

    if (!videoBuffer) {
      await supabase.from("videos").update({ status: "error" }).eq("id", videoId);
      return NextResponse.json({ error: "No video content returned" }, { status: 502 });
    }

    // Upload to Storage
    const objectPath = `videos/${user.id}/${videoId}.mp4`;
    const uploadRes = await supabase.storage
      .from("videos")
      .upload(objectPath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });
    if (uploadRes.error) {
      console.error("Storage upload error:", uploadRes.error);
      await supabase.from("videos").update({ status: "error" }).eq("id", videoId);
      return NextResponse.json({ error: "Failed to store video" }, { status: 500 });
    }

    const { error: updateErr } = await supabase
      .from("videos")
      .update({ status: "ready", video_url: objectPath })
      .eq("id", videoId);
    if (updateErr) {
      console.error("DB update error (videos):", updateErr);
      return NextResponse.json({ error: "Failed to finalize video" }, { status: 500 });
    }

    return NextResponse.json({ success: true, path: objectPath }, { status: 200 });
  } catch (error) {
    console.error("/api/videos/generate-video failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

