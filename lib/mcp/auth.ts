/**
 * AlphoGen MCP — request → actor resolution (T-901c skeleton).
 *
 * Implements the auth-design (alphogen-mcp-auth-design.md): a per-user PAT
 * `agk_<token_id>_<secret>`, the secret verified against an HMAC-SHA256(pepper)
 * hash. The production token store (`mcp_tokens` table) is a FUTURE migration
 * (Paul's go, R-003) — until then this resolver is **fail-closed** and supports a
 * single env-configured TEST token so the read-only tools can be exercised on a
 * test account WITHOUT any DB or service-role exposure to the MCP.
 *
 * Fail-closed means: if the pepper or the test-token env is unset, every request
 * is rejected (401). The MCP surface is inert by default.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { McpActor, McpScope } from "@/lib/mcp/types";

const VALID_SCOPES: readonly McpScope[] = [
  "read",
  "plan",
  "generate",
  "export",
  "assets",
];

export interface ParsedToken {
  tokenId: string;
  secret: string;
}

/**
 * Parse `agk_<token_id>_<secret>`. Returns null on any malformation. The id and
 * secret are base62; we only require the prefix + two non-empty parts so the
 * format can evolve without breaking the parser.
 */
export function parseToken(raw: string): ParsedToken | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("agk_")) return null;
  const rest = trimmed.slice(4);
  const sep = rest.indexOf("_");
  if (sep <= 0) return null;
  const tokenId = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!tokenId || !secret) return null;
  if (!/^[A-Za-z0-9]+$/.test(tokenId) || !/^[A-Za-z0-9]+$/.test(secret)) {
    return null;
  }
  return { tokenId, secret };
}

/** Extract the bearer token from an Authorization header value. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

/** HMAC-SHA256(pepper, secret) → lowercase hex. The only way secrets are stored. */
export function hashTokenSecret(secret: string, pepper: string): string {
  return createHmac("sha256", pepper).update(secret).digest("hex");
}

/** Constant-time hex comparison. */
function safeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

function parseScopes(csv: string | undefined): McpScope[] {
  if (!csv) return ["read", "plan"];
  const scopes = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is McpScope => (VALID_SCOPES as readonly string[]).includes(s));
  return scopes.length > 0 ? scopes : ["read", "plan"];
}

export type ResolveResult =
  | { ok: true; actor: McpActor }
  | { ok: false; status: number; error: string };

const UNAUTHORIZED: ResolveResult = {
  ok: false,
  status: 401,
  error: "Unauthorized",
};

/**
 * Resolve the Authorization header to an {@link McpActor}, fail-closed.
 *
 * Resolution order (skeleton): env-configured TEST token only. Production lookup
 * against `mcp_tokens` is wired in a later step once the migration lands. Any
 * missing config or mismatch → generic 401 (no detail, no timing oracle on id).
 */
export function resolveMcpActor(req: Request): ResolveResult {
  const pepper = process.env.MCP_TOKEN_PEPPER;
  if (!pepper) return UNAUTHORIZED; // inert until configured

  const token = parseBearer(req.headers.get("authorization"));
  if (!token) return UNAUTHORIZED;
  const parsed = parseToken(token);
  if (!parsed) return UNAUTHORIZED;

  // --- TEST-account token (env), no DB. Production path = mcp_tokens (later). --
  const testId = process.env.MCP_TEST_TOKEN_ID;
  const testHash = process.env.MCP_TEST_TOKEN_SECRET_HASH;
  const testUser = process.env.MCP_TEST_USER_ID;
  if (testId && testHash && testUser && parsed.tokenId === testId) {
    const candidate = hashTokenSecret(parsed.secret, pepper);
    if (safeHexEqual(candidate, testHash)) {
      return {
        ok: true,
        actor: {
          userId: testUser,
          scopes: parseScopes(process.env.MCP_TEST_TOKEN_SCOPES),
        },
      };
    }
  }

  return UNAUTHORIZED;
}

/** Does the actor hold the scope a tool requires? */
export function hasScope(actor: McpActor, scope: McpScope): boolean {
  return actor.scopes.includes(scope);
}
