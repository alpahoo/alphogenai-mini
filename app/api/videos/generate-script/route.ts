import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type GenerateScriptInput = { idea?: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GenerateScriptInput;
    const idea = (body?.idea ?? "").toString().trim();
    if (!idea) {
      return NextResponse.json({ error: "idea is required" }, { status: 400 });
    }

    const qwenUrl = process.env.QWEN_API_URL;
    const qwenKey = process.env.QWEN_API_KEY;
    if (!qwenUrl || !qwenKey) {
      return NextResponse.json({ error: "Qwen API is not configured" }, { status: 500 });
    }

    const prompt = `You are a content strategist. Based on the following idea, generate a concise short-form video script (<= 180 words), 5-8 relevant hashtags, and a one-paragraph social description. Respond strictly as JSON with keys: script, hashtags, description. Idea: ${idea}`;

    const qwenRes = await fetch(qwenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${qwenKey}`,
      },
      body: JSON.stringify({
        input: prompt,
        response_format: { type: "json_object" },
      }),
    });

    if (!qwenRes.ok) {
      const txt = await qwenRes.text();
      console.error("Qwen API error:", qwenRes.status, txt);
      return NextResponse.json({ error: "Failed to generate script" }, { status: 502 });
    }

    let script = "";
    let hashtags = "";
    let description = "";
    try {
      const data = await qwenRes.json();
      const payload = typeof data === "string" ? JSON.parse(data) : data;
      script = (payload.script ?? "").toString();
      hashtags = Array.isArray(payload.hashtags)
        ? payload.hashtags.join(" ")
        : (payload.hashtags ?? "").toString();
      description = (payload.description ?? "").toString();
    } catch (e) {
      console.error("Qwen response parse error:", e);
      return NextResponse.json({ error: "Invalid response from Qwen" }, { status: 502 });
    }

    const { data, error } = await supabase
      .from("videos")
      .insert({
        user_id: user.id,
        idea,
        script,
        hashtags,
        description,
        status: "pending",
      })
      .select("id, idea, script, hashtags, description, status, created_at")
      .single();

    if (error) {
      console.error("DB insert error (videos):", error);
      return NextResponse.json({ error: "Failed to save video" }, { status: 500 });
    }

    return NextResponse.json({ video: data }, { status: 201 });
  } catch (error) {
    console.error("/api/videos/generate-script failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

