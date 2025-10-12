import { NextResponse } from "next/server";
import { createClient as createService } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || "videos";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, filename, contentType } = body || {};
    if (!project_id || !filename || !contentType)
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    // Auth: read user from cookies/session
    const supaSSR = await createServerSupabase();
    const { data: userData, error: userErr } = await supaSSR.auth.getUser();
    if (userErr || !userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = userData.user.id;

    // Service role client for privileged operations
    const supabase = createService(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify ownership
    const { data: project, error: pErr } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", project_id)
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 404 });
    if (project.user_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const objectPath = `final/${project_id}/${filename}`;

    // Create a signed upload URL using service role
    const { data: signed, error: signErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (signErr) return NextResponse.json({ error: signErr.message }, { status: 500 });

    return NextResponse.json({ signedUrl: signed.signedUrl, objectPath });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
