import { NextResponse } from "next/server";
import { requireAdmin } from "../../middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptSecret } from "@/lib/encryption";

/**
 * POST /api/admin/engines/migrate-env
 *
 * One-shot migration helper: copies API keys from Vercel env vars into
 * encrypted DB secrets (engine_secrets table).
 *
 * Mapping (hardcoded — these are the known legacy env var names):
 *   - KIE_API_KEY → seedance/api_key
 *
 * Safe to call multiple times (upsert).
 * Returns list of migrated secrets.
 */
const MIGRATIONS: Array<{ envVar: string; engineId: string; secretName: string }> = [
  { envVar: "KIE_API_KEY", engineId: "seedance", secretName: "api_key" },
];

export async function POST() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const supabase = createServiceClient();
  const migrated: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const { envVar, engineId, secretName } of MIGRATIONS) {
    const value = process.env[envVar];
    if (!value) {
      skipped.push(`${envVar}: not set in Vercel`);
      continue;
    }

    try {
      const { encrypted, iv, authTag } = encryptSecret(value.trim());
      const { error } = await supabase.from("engine_secrets").upsert(
        {
          engine_id: engineId,
          secret_name: secretName,
          secret_value_encrypted: encrypted,
          iv,
          auth_tag: authTag,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "engine_id,secret_name" }
      );

      if (error) {
        errors.push(`${engineId}/${secretName}: ${error.message}`);
      } else {
        migrated.push(`${envVar} → ${engineId}/${secretName}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "encryption failed";
      errors.push(`${envVar}: ${msg}`);
    }
  }

  console.log(
    `[admin] Env → DB migration: ${migrated.length} migrated, ${skipped.length} skipped, ${errors.length} errors (by ${auth.user.email})`
  );

  return NextResponse.json({
    success: errors.length === 0,
    migrated,
    skipped,
    errors,
  });
}
