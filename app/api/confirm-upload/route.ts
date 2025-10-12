import { NextResponse } from "next/server";
import { createClient as createService } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "videos";

export async function POST(req: Request) {
  try {
    const supabase = createService(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { project_id, objectPath, user_id } = await req.json();

    if (!project_id || !objectPath || !user_id)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Check project ownership
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", project_id)
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });
    if (project.user_id !== user_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Optionally verify the object exists
    const { data: stat, error: statErr } = await supabase.storage.from(STORAGE_BUCKET).list(`final/${project_id}`, {
      limit: 100,
      offset: 0,
    });
    if (statErr) return NextResponse.json({ error: statErr.message }, { status: 500 });

    const exists = (stat || []).some((f) => `final/${project_id}/${f.name}` === objectPath);
    if (!exists) return NextResponse.json({ error: "Object not found after upload" }, { status: 400 });

    // Update project.final_video_path
    const { error: updErr } = await supabase
      .from("projects")
      .update({ final_video_path: objectPath, updated_at: new Date().toISOString() })
      .eq("id", project_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, path: objectPath });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
