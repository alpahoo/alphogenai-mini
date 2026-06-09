/**
 * AlphoGen MCP — shared types for the read-only / validate skeleton (T-901c).
 *
 * The MCP surface (`/api/mcp`) is a thin, provider-neutral layer over AlphoGen's
 * own server-side helpers. It NEVER exposes Supabase, providers, or secrets to the
 * caller. See docs/product/alphogen-mcp-spec.md and -auth-design.md.
 */

/** Least-privilege permission scopes (auth-design §4). */
export type McpScope = "read" | "plan" | "generate" | "export" | "assets";

/** A resolved caller — acts strictly as one user, like a logged-in session. */
export interface McpActor {
  userId: string;
  scopes: McpScope[];
}

/** Uniform tool outcome. `ok:false` carries an HTTP-ish status + safe message. */
export type McpResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; code?: string };

/** Static, provider-neutral catalog entry (safe to expose without user data). */
export interface McpToolInfo {
  name: string;
  /** Scope required to invoke. */
  scope: McpScope;
  /** Whether the tool can spend money / mutate generation state. */
  cost: "none";
  description: string;
}

/**
 * Provider-neutral view of a job. Deliberately omits raw engine keys
 * (`*_byteplus`), provider names, internal storage paths, and cost internals.
 */
export interface PublicJob {
  id: string;
  status: string;
  stage: string | null;
  prompt: string;
  /** Display model name only (e.g. "Seedance 2.0 Fast") — never a provider key. */
  model: string;
  aspect_ratio: string | null;
  duration_seconds: number;
  scene_count: number;
  /** Final rendered output, if ready. */
  output_url: string | null;
  /** platform → url (e.g. { tiktok, instagram, youtube }). */
  social_exports: Record<string, string> | null;
  /** Failure reason, scrubbed of any provider/aggregator names. */
  error: string | null;
  created_at: string;
  updated_at: string;
}
