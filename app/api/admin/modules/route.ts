import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getModuleModes, isModuleMode, isParallaxModuleId, sanitizeModes } from "@/lib/parallax-modules";
import { requireAdmin } from "@/app/api/admin/middleware";

/** Stored modes: true = everybody, "admin" = administrators only, false = off. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  return NextResponse.json({ modules: await getModuleModes() });
}

/** Body: { module, mode: true | false | "admin" } (the older { module, enabled: boolean } still works). */
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as { module?: unknown; mode?: unknown; enabled?: unknown } | null;
  const mode = body && "mode" in body ? body.mode : body?.enabled;
  if (!body || !isParallaxModuleId(body.module) || !isModuleMode(mode)) {
    return NextResponse.json({ error: "module and a mode (true, false or \"admin\") are required" }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: current } = await service.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
  const modules = sanitizeModes(current?.value);
  modules[body.module] = mode;
  const { error } = await service.from("app_settings").upsert({ key: "parallax_modules", value: modules, updated_at: new Date().toISOString() });
  if (error) {
    console.error("parallax_modules_save_failed", error.code ?? "unknown");
    return NextResponse.json({ error: "Could not save module setting" }, { status: 500 });
  }
  return NextResponse.json({ success: true, modules });
}
