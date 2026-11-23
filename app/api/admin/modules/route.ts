import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PARALLAX_MODULES, defaultModuleStates, isParallaxModuleId } from "@/lib/parallax-modules";
import { requireAdmin } from "@/app/api/admin/middleware";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const service = createServiceClient();
  const { data } = await service.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
  const defaults = defaultModuleStates();
  const stored = data?.value && typeof data.value === "object" ? data.value as Record<string, unknown> : {};
  const modules = Object.fromEntries(
    Object.keys(PARALLAX_MODULES).map((id) => [id, typeof stored[id] === "boolean" ? stored[id] : defaults[id as keyof typeof defaults]]),
  );
  return NextResponse.json({ modules });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => null) as { module?: unknown; enabled?: unknown } | null;
  if (!body || !isParallaxModuleId(body.module) || typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "module and boolean enabled are required" }, { status: 400 });
  }
  const service = createServiceClient();
  const { data: current } = await service.from("app_settings").select("value").eq("key", "parallax_modules").maybeSingle();
  const modules = { ...defaultModuleStates(), ...(current?.value && typeof current.value === "object" ? current.value : {}) };
  modules[body.module] = body.enabled;
  const { error } = await service.from("app_settings").upsert({ key: "parallax_modules", value: modules, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Could not save module setting" }, { status: 500 });
  return NextResponse.json({ success: true, modules });
}

