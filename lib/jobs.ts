import type { SupabaseClient } from "@supabase/supabase-js";

export type CreateJobInput = {
  prompt: string;
  duration_sec?: number;
  resolution?: string;
  fps?: number;
  seed?: number | null;
  created_via: string;
};

export async function insertJob(
  supabase: SupabaseClient,
  userId: string | null,
  input: CreateJobInput,
) {
  const { prompt, duration_sec, resolution, fps, seed, created_via } = input;

  const { data: job, error: insertError } = await supabase
    .from("jobs")
    .insert({
      user_id: userId,
      prompt: prompt,
      status: "pending",
      app_state: {
        prompt: prompt,
        duration_sec: duration_sec || 60,
        resolution: resolution || "1920x1080",
        fps: fps || 24,
        seed: seed ?? null,
        created_via,
      },
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return job;
}

