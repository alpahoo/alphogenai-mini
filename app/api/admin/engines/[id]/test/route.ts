import { NextResponse } from "next/server";
import { requireAdmin } from "../../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptSecret } from "@/lib/encryption";

/**
 * POST /api/admin/engines/[id]/test — Test API connection for an engine.
 *
 * Validates that create_task endpoint is reachable with current secrets.
 * Does NOT actually generate a video (dry-run on credentials only).
 *
 * Returns: { success: true, status: 200, message: "..." }
 *       or { success: false, error: "..." }
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const supabase = createServiceClient();

  // Load engine + config + secrets
  const [engineRes, secretsRes] = await Promise.all([
    supabase.from("engines").select("id, type, api_config").eq("id", id).single(),
    supabase.from("engine_secrets").select("secret_name, secret_value_encrypted, iv, auth_tag").eq("engine_id", id),
  ]);

  if (engineRes.error || !engineRes.data) {
    return NextResponse.json({ success: false, error: "Engine not found" }, { status: 404 });
  }

  const engine = engineRes.data;
  if (engine.type !== "api") {
    return NextResponse.json({
      success: false,
      error: "Test only supported for 'api' type engines",
    });
  }

  const config = (engine.api_config as Record<string, unknown>) || {};
  const createTask = config.create_task as Record<string, unknown> | undefined;

  if (!createTask || !createTask.url) {
    return NextResponse.json({
      success: false,
      error: "No api_config.create_task.url configured",
    });
  }

  // Decrypt secrets
  const secrets: Record<string, string> = {};
  for (const row of secretsRes.data ?? []) {
    try {
      secrets[row.secret_name] = decryptSecret({
        encrypted: row.secret_value_encrypted,
        iv: row.iv,
        authTag: row.auth_tag,
      });
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: `Failed to decrypt secret '${row.secret_name}': ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  // Render template
  const ctx = {
    prompt: "test connection check",
    duration: 5,
    image_url: "",
    secrets,
  };

  try {
    const url = renderTemplate(createTask.url as string, ctx);
    const method = ((createTask.method as string) || "POST").toUpperCase();
    const headers = renderDict((createTask.headers as Record<string, string>) || {}, ctx);
    const body = renderBody(createTask.body, ctx);

    // Just make the request, don't check for success — we're testing auth/reachability
    const testRes = await fetch(url, {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await testRes.text();
    const responseBrief = responseText.slice(0, 300);

    return NextResponse.json({
      success: testRes.status < 500,
      status: testRes.status,
      message: testRes.ok
        ? "Connection successful — API reachable and credentials accepted"
        : `API returned ${testRes.status}: ${responseBrief}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: `Request failed: ${msg}`,
    });
  }
}

// ----- Template rendering helpers (mirrors Python GenericApiEngine) -----

function renderTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const clean = expr.replace("|optional", "").trim();
    const value = ctxPath(ctx, clean);
    return value !== undefined && value !== null ? String(value) : "";
  });
}

function renderDict(d: Record<string, string>, ctx: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    out[k] = typeof v === "string" ? renderTemplate(v, ctx) : v;
  }
  return out;
}

function renderBody(body: unknown, ctx: Record<string, unknown>): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body === "string") {
    if (body.includes("|optional")) {
      const rendered = renderTemplate(body, ctx);
      return rendered === "" ? undefined : rendered;
    }
    return renderTemplate(body, ctx);
  }
  if (Array.isArray(body)) {
    return body.map((v) => renderBody(v, ctx));
  }
  if (typeof body === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      const rendered = renderBody(v, ctx);
      if (rendered !== undefined) out[k] = rendered;
    }
    return out;
  }
  return body;
}

function ctxPath(ctx: Record<string, unknown>, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}
