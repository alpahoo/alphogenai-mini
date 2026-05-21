import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/flags";

/**
 * GET /api/admin/providers — Read provider toggle states.
 * PATCH /api/admin/providers — Update a provider's enabled state.
 *
 * Admin-only. Stored in app_settings table (key = 'providers').
 */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const svc = createServiceClient();
  const { data } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", "providers")
    .single();

  return NextResponse.json({
    providers: data?.value ?? {
      bailian: { enabled: false },
      evolink: { enabled: true },
      modal: { enabled: true },
    },
  });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { provider, enabled } = body as {
    provider: string;
    enabled: boolean;
  };

  if (!provider || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "provider (string) and enabled (boolean) required" },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  // Read current settings
  const { data: current } = await svc
    .from("app_settings")
    .select("value")
    .eq("key", "providers")
    .single();

  const settings = (current?.value as Record<string, { enabled: boolean }>) ?? {};
  settings[provider] = { enabled };

  // Upsert
  await svc
    .from("app_settings")
    .upsert({
      key: "providers",
      value: settings,
      updated_at: new Date().toISOString(),
    });

  console.log(
    `[admin/providers] ${user.email} set ${provider} → ${enabled ? "enabled" : "disabled"}`
  );

  return NextResponse.json({ success: true, providers: settings });
}
