import { createClient } from "@supabase/supabase-js";
import { createClient as createAuthClient } from "@/lib/supabase/server";
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
    const authClient = await createAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const supabase = getSupabaseClient();
    const formData = await req.formData();
    
    const prompt = formData.get("prompt") as string;
    const duration = formData.get("duration") ? parseInt(formData.get("duration") as string) : 10;
    const resolution = formData.get("resolution") as string || "720p";
    const seed = formData.get("seed") ? parseInt(formData.get("seed") as string) : undefined;
    const negativePrompt = formData.get("negativePrompt") as string || undefined;

    if (!prompt || prompt.length < 5)
      return NextResponse.json({ error: "Prompt required (min 5 chars)" }, { status: 400 });

    const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");

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
          status: "done",
          final_url: cached.video_url,
          user_id: user.id,
          app_state: { cached: true, prompt, promptHash, duration, resolution },
        })
        .select()
        .single();

      return NextResponse.json({
        jobId: job.id,
        videoUrl: cached.video_url,
        cached: true,
      });
    }

    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        prompt,
        status: "pending",
        user_id: user.id,
        app_state: { 
          prompt, 
          promptHash, 
          cached: false,
          duration,
          resolution,
          seed,
          negativePrompt
        },
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ jobId: job.id, cached: false });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
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
