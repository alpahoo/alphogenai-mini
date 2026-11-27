import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { isModuleEnabled } from "@/lib/parallax-modules";
import { screenPrompt } from "@/lib/content-policy";
import { rewriteH3Prompt } from "@/lib/parallax-h3-prompt";
import { isH3ShortEngine, resolveShortDuration, resolveShortEngine } from "@/lib/parallax-shorts";

/**
 * Proposes an H3 prompt for a Short (text only: nothing is admitted, reserved or rendered here).
 * The page shows it for review and editing; the Shorts route then admits the final text.
 * Admin only, like the H3 pilot itself.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  if (!(await isModuleEnabled("parallax_shorts", auth.user))) {
    return NextResponse.json({ error: "Parallax Shorts is disabled" }, { status: 404 });
  }
  const body = await request.json().catch(() => null) as { prompt?: unknown; engine?: unknown; target_duration_seconds?: unknown } | null;
  const idea = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (idea.length < 3 || idea.length > 2000) return NextResponse.json({ error: "A short idea is required" }, { status: 400 });
  const engine = resolveShortEngine(body?.engine);
  if (!isH3ShortEngine(engine)) return NextResponse.json({ error: "Only MiniMax H3 uses this prompt format" }, { status: 400 });
  // Screen the idea first so a refused idea is never laundered through the rewrite.
  if (screenPrompt(idea).blocked) return NextResponse.json({ error: "Prompt does not meet the current content policy" }, { status: 400 });
  const result = await rewriteH3Prompt(idea, resolveShortDuration(engine, body?.target_duration_seconds));
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
