import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isModuleEnabled } from "@/lib/parallax-modules";
import { resolveShortEngine, shortSceneCount } from "@/lib/parallax-shorts";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Guard before anything else (no job is created while the module is off for this viewer), then authentication.
  if (!(await isModuleEnabled("parallax_shorts", user))) {
    return NextResponse.json({ error: "Parallax Shorts is disabled" }, { status: 404 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { prompt?: unknown; target_duration_seconds?: unknown; engine?: unknown } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 2000) return NextResponse.json({ error: "A short idea is required" }, { status: 400 });
  const duration = body?.target_duration_seconds === 5 ? 5 : 10;
  // Engine chosen on the page; unknown or not-yet-available choices fall back to LTX-2.5.
  const engine = resolveShortEngine(body?.engine);
  const scenes = shortSceneCount(engine);
  const upstream = new URL("/api/jobs", request.url);
  const response = await fetch(upstream, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
    body: JSON.stringify({
      prompt,
      target_duration_seconds: duration,
      aspect_ratio: "9:16",
      preferred_engine: engine,
      ...(scenes !== undefined && { num_scenes: scenes }),
    }),
  });
  return new NextResponse(response.body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" } });
}

