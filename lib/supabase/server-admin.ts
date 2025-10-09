import { createClient } from "@supabase/supabase-js";

export function getServerSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    (process.env as any).SUPABASE_SUPABASE_SERVICE_ROLE_KEY; // legacy alias support
  if (!url || !key) throw new Error("Missing SUPABASE service envs");
  return createClient(url, key, { auth: { persistSession: false } });
}
