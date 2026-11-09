import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";

const MAX_LIMIT = 50;

/** The calling admin's own ComfyUI runs, newest first. Media URLs are never included. */
export async function GET(req: Request) {
  const auth = await requireAdmin(); if (auth.response) return auth.response;
  const url = new URL(req.url);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "30", 10) || 30));
  const db = createServiceClient();
  const { data: runs, error } = await db.from("comfy_runs")
    .select("id,job_id,status,error_code,generation_seconds,params_effective,created_at,finished_at,template_version")
    .eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(limit);
  if (error) return NextResponse.json({ error: "History unavailable" }, { status: 503, headers: privateHeaders });
  const ids = (runs ?? []).map(r => r.id);
  let assets: { id: string; run_id: string; role: string; mime: string }[] = [];
  if (ids.length) {
    const { data, error: assetError } = await db.from("comfy_assets").select("id,run_id,role,mime")
      .in("run_id", ids).eq("owner_id", auth.user.id).is("withdrawn_at", null);
    if (assetError) return NextResponse.json({ error: "History unavailable" }, { status: 503, headers: privateHeaders });
    assets = data ?? [];
  }
  const items = (runs ?? []).map(run => ({
    ...run,
    // Same rule as the run route: outputs are listed only for completed runs.
    assets: run.status === "done" ? assets.filter(a => a.run_id === run.id).map(({ id, role, mime }) => ({ id, role, mime })) : [],
  }));
  return NextResponse.json({ items }, { headers: privateHeaders });
}
