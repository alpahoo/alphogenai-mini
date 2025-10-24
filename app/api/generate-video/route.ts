import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import crypto from "crypto";

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createServiceClient(supabaseUrl, supabaseKey);
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const { prompt, webhookUrl, source_job_id } = await req.json();

    if (!prompt || prompt.length < 5)
      return NextResponse.json({ error: "Prompt required" }, { status: 400 });

    if (source_job_id) {
      const authClient = await createClient();
      const { data: { user }, error: authError } = await authClient.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { error: "Authentication required to reuse assets" },
          { status: 401 }
        );
      }

      const isAdmin = user.user_metadata?.role === 'admin';
      if (!isAdmin) {
        return NextResponse.json(
          { error: "Admin access required to reuse assets from previous jobs" },
          { status: 403 }
        );
      }
    }

    const promptHash = crypto.createHash("sha256").update(prompt).digest("hex");

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
          status: "done",
          final_url: cached.video_url,
          app_state: { cached: true, prompt, promptHash },
        })
        .select()
        .single();

      return NextResponse.json({
        jobId: job.id,
        final_url: cached.video_url,
        cached: true,
      });
    }

    // Crée un nouveau job
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({
        prompt,
        status: "pending",
        app_state: { 
          prompt, 
          promptHash, 
          cached: false,
          source_job_id: source_job_id || null
        },
        webhook_url: webhookUrl || null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ jobId: job.id, cached: false });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const supabase = getSupabaseServiceClient();
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
