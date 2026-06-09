/**
 * AlphoGen MCP surface — `/api/mcp` (T-901c skeleton).
 *
 * A thin, provider-neutral dispatcher over AlphoGen's own server-side helpers.
 * It NEVER hands Supabase, providers, or secrets to the caller. Every tool acts
 * strictly as the PAT's user (ownership scoping) and reuses the existing gates
 * (no new gate logic — `validate_job_payload` calls `assertCanCreateJob`).
 *
 * Safety posture:
 *   - Disabled by default (`MCP_ENABLED !== "true"` → 404). Inert until reviewed.
 *   - Auth is fail-closed (see lib/mcp/auth.ts).
 *   - Read-only / validate tools only — NO cost-incurring `create_video` here.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveMcpActor, hasScope } from "@/lib/mcp/auth";
import { MCP_TOOLS, toolCatalog } from "@/lib/mcp/tools";

export const maxDuration = 30;

function enabled(): boolean {
  return process.env.MCP_ENABLED === "true";
}

/** Provider-neutral capability listing (static; no user data). */
export async function GET() {
  if (!enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: "alphogen-mcp",
    version: "0.1.0-skeleton",
    phase: "T-901c (read-only / validate)",
    tools: toolCatalog(),
  });
}

export async function POST(req: Request) {
  if (!enabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // --- auth (fail-closed) ---------------------------------------------------
  const auth = resolveMcpActor(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { actor } = auth;

  // --- parse request --------------------------------------------------------
  let body: { tool?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const toolName = typeof body.tool === "string" ? body.tool : "";
  const input =
    body.input && typeof body.input === "object" && !Array.isArray(body.input)
      ? (body.input as Record<string, unknown>)
      : {};

  const tool = MCP_TOOLS[toolName];
  if (!tool) {
    return NextResponse.json(
      { error: `Unknown tool: ${toolName || "(none)"}` },
      { status: 404 },
    );
  }

  // --- scope check ----------------------------------------------------------
  if (!hasScope(actor, tool.info.scope)) {
    return NextResponse.json(
      { error: `Missing scope: ${tool.info.scope}` },
      { status: 403 },
    );
  }

  // --- run (service-role stays server-side, scoped by actor.userId) ---------
  const supabase = createServiceClient();
  const result = await tool.run(actor, input, { supabase });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  }
  return NextResponse.json({ tool: toolName, data: result.data });
}
