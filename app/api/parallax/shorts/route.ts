import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isModuleEnabled } from "@/lib/parallax-modules";
import { isH3ShortEngine, resolveShortDuration, resolveShortEngine, shortH3Params, shortSceneCount, shortStudioUrl } from "@/lib/parallax-shorts";

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
  // Engine chosen on the page; unknown or not-yet-available choices fall back to LTX-2.5.
  const engine = resolveShortEngine(body?.engine);
  const duration = resolveShortDuration(engine, body?.target_duration_seconds);
  if (isH3ShortEngine(engine)) {
    // 704p and 10 s H3 renders need the long executor; refuse them until it is deployed and enabled.
    if ((engine === "h3_turbo_704" || duration > 5) && process.env.COMFY_H3_LONG_ENABLED !== "true") {
      return NextResponse.json({ error: "MiniMax H3 en 704p ou en 10 s attend le déploiement de l’exécuteur long. Choisissez 480p en 5 s." }, { status: 503 });
    }
    // MiniMax H3 only runs through the isolated Studio pilot: same admin check, gate, budget, content
    // screening and audio correction as a Studio run. Nothing is admitted here directly.
    const admission = await fetch(new URL("/api/admin/comfy/runs", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify({ template: "minimax-h3", idempotency_key: randomUUID(), params: shortH3Params(engine, prompt, duration) }),
    });
    const data = await admission.json().catch(() => ({})) as { run_id?: unknown; dispatched?: unknown; error?: unknown };
    if (!admission.ok || typeof data.run_id !== "string") {
      return NextResponse.json({ error: typeof data.error === "string" ? data.error : "MiniMax H3 could not start" },
        { status: admission.ok ? 502 : admission.status });
    }
    return NextResponse.json({ run_id: data.run_id, dispatched: data.dispatched === true, redirect: shortStudioUrl(data.run_id) },
      { status: 202, headers: { "Cache-Control": "private, no-store" } });
  }
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

