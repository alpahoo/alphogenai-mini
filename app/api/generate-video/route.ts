import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import crypto from "crypto";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseClient();
    const { 
      prompt, 
      webhookUrl, 
      generation_mode = "t2v", 
      image_ref_url 
    } = await req.json();

    if (!prompt || prompt.length < 5)
      return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    // Validate generation mode
    if (!["t2v", "i2v"].includes(generation_mode)) {
      return NextResponse.json({ error: "Invalid generation_mode. Must be 't2v' or 'i2v'" }, { status: 400 });
    }

    // Validate image_ref_url for i2v mode
    if (generation_mode === "i2v" && !image_ref_url) {
      return NextResponse.json({ error: "image_ref_url is required for i2v mode" }, { status: 400 });
    }

    // Create cache key including generation mode and image
    const cacheKey = generation_mode === "i2v" 
      ? `${prompt}|${generation_mode}|${image_ref_url}`
      : `${prompt}|${generation_mode}`;
    const promptHash = crypto.createHash("sha256").update(cacheKey).digest("hex");

    // Vérifie le cache
    const { data: cached } = await supabase
      .from("video_cache")
      .select("video_url")
      .eq("prompt_hash", promptHash)
      .single();

    if (cached?.video_url) {
      const { data: job } = await supabase
        .from("jobs")
        .insert({
          prompt,
          generation_mode,
          image_ref_url,
          status: "done",
          final_url: cached.video_url,
          app_state: { 
            cached: true, 
            prompt, 
            promptHash,
            generation_mode,
            image_ref_url
          },
        })
        .select()
        .single();

      return NextResponse.json({
        jobId: job.id,
        final_url: cached.video_url,
        cached: true,
        generation_mode,
      });
    }

    // Crée un nouveau job
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        prompt,
        generation_mode,
        image_ref_url,
        status: "pending",
        app_state: { 
          prompt, 
          promptHash, 
          cached: false,
          generation_mode,
          image_ref_url
        },
        webhook_url: webhookUrl || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ 
      jobId: job.id, 
      cached: false,
      generation_mode,
      image_ref_url
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const supabase = getSupabaseClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data, error } = await supabase
    .from("jobs")
    .select()
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}
