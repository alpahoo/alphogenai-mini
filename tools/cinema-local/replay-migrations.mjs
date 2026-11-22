// Prepare the LOCAL test database: replay supabase/migrations one file per transaction, in name order.
//
// Why not `supabase start` / `db reset`? The historical chain does not replay on a blank database (see
// docs/cinema-m1-local-recipe.md). Five files fail for reasons that predate Cinema M1; this script asserts that
// exactly those five fail with exactly those errors, and that H3, MOSS and Cinema M1 apply. A different result
// means the chain changed: update docs/cinema-m1-local-recipe.md together with KNOWN_FAILURES below.
//
// Run it once on a blank local database (config.toml with [db.migrations] enabled = false).
import { readdirSync } from "node:fs";
import path from "node:path";
import { ROOT, psql } from "./lib.mjs";

export const KNOWN_FAILURES = {
  "20251002_add_notes.sql": 'syntax error at or near "not"',
  "20260608_byteplus_assets_thumb_and_update_policy.sql": 'relation "public.byteplus_assets" does not exist',
  "20260609_enable_rls_app_settings.sql": 'relation "public.app_settings" does not exist',
  "20260609_harden_function_search_path.sql": "function public.set_timestamp() does not exist",
  "20260622_add_podcast_render_columns.sql": 'relation "public.podcasts" does not exist',
};
const MUST_APPLY = ["20261108_comfy_admin_h3.sql", "20261109_comfy_moss_image.sql", "20261122_cinema_m1.sql"];

const dir = path.join(ROOT, "supabase/migrations");
// The Supabase CLI skips file names that do not start with a timestamp; so do we.
const files = readdirSync(dir).filter((f) => /^\d{8}.*\.sql$/.test(f)).sort();
const applied = [], failed = {};
for (const f of files) {
  const r = psql("", { file: path.join(dir, f) });
  if (r.ok) applied.push(f); else failed[f] = r.error.replace(/^ERROR:\s*/, "");
  console.log((r.ok ? "OK   " : "FAIL ") + f + (r.ok ? "" : "  :: " + r.error));
}
console.log(`\napplied=${applied.length} failed=${Object.keys(failed).length}`);

let ok = true;
for (const f of MUST_APPLY) if (!applied.includes(f)) { ok = false; console.log("UNEXPECTED: " + f + " did not apply"); }
for (const [f, msg] of Object.entries(failed)) {
  if (!(f in KNOWN_FAILURES)) { ok = false; console.log("UNEXPECTED FAILURE: " + f + " :: " + msg); }
  else if (!msg.includes(KNOWN_FAILURES[f])) { ok = false; console.log("DIFFERENT ERROR for " + f + ": expected '" + KNOWN_FAILURES[f] + "', got '" + msg + "'"); }
}
for (const f of Object.keys(KNOWN_FAILURES)) if (!(f in failed)) { ok = false; console.log("EXPECTED FAILURE DID NOT HAPPEN: " + f + " (already applied database, or the chain changed)"); }
console.log(ok ? "REPLAY OK: only the five documented historical failures." : "REPLAY MISMATCH: see above.");
process.exit(ok ? 0 : 1);
