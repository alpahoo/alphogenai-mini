import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const role = (claims?.claims as any)?.app_metadata?.role;
  if (role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("scheduled_posts")
    .update({ status: "approved" })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger Runway generation via Edge Function with service role
  try {
    const serviceUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceUrl || !serviceKey) throw new Error("Missing Supabase service envs");

    const endpoint = `${serviceUrl}/functions/v1/runway-generate`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ scheduled_post_id: id }),
      // don't block admin UI on long processing
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ ok: false, trigger_error: json?.error || `HTTP ${res.status}` });
    }
    return NextResponse.json({ ok: true, trigger: json });
  } catch (e: any) {
    return NextResponse.json({ ok: false, trigger_error: e.message || String(e) });
  }
}
