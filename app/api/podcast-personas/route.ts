import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUserFromRequest } from "@/lib/podcast/auth";

/**
 * Podcast personas API (T-1136c).
 *
 * A persona is a reusable "who" for a podcast speaker slot (host/guest). It
 * resolves to a static portrait the render will composite in place of the H/G
 * placeholder (T-1136e reads podcast_speakers.persona_id).
 *
 * V1 scope:
 *  - GET    — list the public catalog (AlphoGen-owned) + the caller's own
 *             personas, with resolved portrait/thumbnail URLs (signed for
 *             private storage paths, passed through for public catalog URLs).
 *  - POST   — create one of the caller's OWN personas. source_kind 'catalog'
 *             is NOT user-creatable (service-role seeded only). 'uploaded'
 *             (a real likeness) REQUIRES an explicit consent attestation —
 *             mirrors the DB CHECK (podcast_personas_uploaded_requires_consent).
 *  - PATCH  — rename one of the caller's own personas.
 *  - DELETE — soft-remove (status='removed') so past renders keep resolving.
 *
 * Auth: bearer token (getUserFromRequest); the user id ALWAYS comes from the
 * verified token, never the body. RLS also enforces ownership, but these routes
 * use the service client + explicit filters (same pattern as the other podcast
 * routes), so the scoping is done here too.
 *
 * NOTE: the actual image upload (bytes → private `podcast-personas` bucket) and
 * the picker UI are deferred (T-1136d). This route accepts an already-resolved
 * `portrait_path`; catalog personas (public URLs, seeded server-side) work
 * end-to-end today, which is what unblocks T-1136e.
 */

const PORTRAIT_BUCKET = "podcast-personas";
const SIGNED_URL_TTL_SEC = 86400; // 24h, same as byteplus-assets thumbnails
// The exact attestation wording lives in the UI; the route records WHICH
// version the user agreed to (auditable). Bump when the copy changes.
const CONSENT_STATEMENT_VERSION = "v1-2026-07";

const NAME_MAX = 120;
const PATH_MAX = 500;
const USER_SOURCE_KINDS = ["uploaded", "generated"] as const;
type UserSourceKind = (typeof USER_SOURCE_KINDS)[number];

interface PersonaRow {
  id: string;
  user_id: string | null;
  source_kind: string;
  name: string;
  portrait_path: string;
  thumb_path: string | null;
  status: string;
  created_at: string;
}

const isHttpUrl = (s: string) => /^https?:\/\//.test(s);

/** Resolve a stored path to a usable URL: pass through public catalog URLs,
 *  sign private storage paths. Best-effort — returns null if signing fails. */
async function resolveUrl(
  service: ReturnType<typeof createServiceClient>,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  if (isHttpUrl(path)) return path;
  const { data } = await service.storage.from(PORTRAIT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SEC);
  return data?.signedUrl ?? null;
}

async function toPublic(service: ReturnType<typeof createServiceClient>, p: PersonaRow) {
  const [portrait_url, thumb_url] = await Promise.all([
    resolveUrl(service, p.portrait_path),
    resolveUrl(service, p.thumb_path),
  ]);
  return {
    id: p.id,
    is_catalog: p.user_id === null,
    source_kind: p.source_kind,
    name: p.name,
    portrait_url,
    thumb_url: thumb_url ?? portrait_url,
    created_at: p.created_at,
  };
}

// ── GET: catalog + own ──────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const service = createServiceClient();
    // Active personas that are either the public catalog (user_id IS NULL) or
    // owned by the caller. RLS would allow the same; the explicit filter keeps
    // the service-client query scoped.
    const { data, error } = await service
      .from("podcast_personas")
      .select("id, user_id, source_kind, name, portrait_path, thumb_path, status, created_at")
      .eq("status", "active")
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[podcast-personas] GET failed:", error.message);
      return NextResponse.json({ error: "Could not load personas" }, { status: 500 });
    }

    const rows = (data ?? []) as PersonaRow[];
    const personas = await Promise.all(rows.map((p) => toPublic(service, p)));
    // Catalog first, then own — a stable, picker-friendly order.
    personas.sort((a, b) => Number(b.is_catalog) - Number(a.is_catalog));
    return NextResponse.json({ personas });
  } catch (err) {
    console.error("GET /api/podcast-personas:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST: create own persona ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
    const sourceKind = typeof body.source_kind === "string" ? body.source_kind.trim() : "";
    const portraitPath = typeof body.portrait_path === "string" ? body.portrait_path.trim() : "";
    const thumbPath = typeof body.thumb_path === "string" ? body.thumb_path.trim() : null;
    const consent = body.consent === true;

    if (!name) return NextResponse.json({ error: "A persona name is required." }, { status: 400 });
    if (!USER_SOURCE_KINDS.includes(sourceKind as UserSourceKind)) {
      // 'catalog' is intentionally excluded — catalog personas are seeded by the
      // service role only, never created by a user.
      return NextResponse.json(
        { error: "source_kind must be 'uploaded' or 'generated'." },
        { status: 400 },
      );
    }
    if (!portraitPath || portraitPath.length > PATH_MAX) {
      return NextResponse.json({ error: "A valid portrait_path is required." }, { status: 400 });
    }
    if (thumbPath && thumbPath.length > PATH_MAX) {
      return NextResponse.json({ error: "thumb_path is too long." }, { status: 400 });
    }

    // Consent guard (mirrors the DB CHECK): an uploaded real likeness cannot be
    // created without an explicit attestation. Recorded with the version agreed to.
    const insert: Record<string, unknown> = {
      user_id: user.id,
      source_kind: sourceKind,
      name,
      portrait_path: portraitPath,
      ...(thumbPath && { thumb_path: thumbPath }),
    };
    if (sourceKind === "uploaded") {
      if (!consent) {
        return NextResponse.json(
          { error: "Uploading a person's likeness requires confirming you have the rights/consent." },
          { status: 400 },
        );
      }
      insert.consent_confirmed_at = new Date().toISOString();
      insert.consent_statement_version = CONSENT_STATEMENT_VERSION;
    }

    const service = createServiceClient();
    const { data, error } = await service
      .from("podcast_personas")
      .insert(insert)
      .select("id, user_id, source_kind, name, portrait_path, thumb_path, status, created_at")
      .single();

    if (error) {
      console.error("[podcast-personas] POST failed:", error.message);
      return NextResponse.json({ error: "Could not create the persona" }, { status: 500 });
    }

    return NextResponse.json({ persona: await toPublic(service, data as PersonaRow) });
  } catch (err) {
    console.error("POST /api/podcast-personas:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH: rename own persona ───────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "A non-empty name is required" }, { status: 400 });

    const service = createServiceClient();
    // Scoped to the caller's own rows (never catalog: user_id = caller).
    const { data, error } = await service
      .from("podcast_personas")
      .update({ name })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, source_kind, name, portrait_path, thumb_path, status, created_at")
      .maybeSingle();

    if (error) {
      console.error("[podcast-personas] PATCH failed:", error.message);
      return NextResponse.json({ error: "Could not update the persona" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Persona not found" }, { status: 404 });

    return NextResponse.json({ persona: await toPublic(service, data as PersonaRow) });
  } catch (err) {
    console.error("PATCH /api/podcast-personas:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE: soft-remove own persona ─────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const service = createServiceClient();
    // Soft-delete: keep the row so any podcast that already references it still
    // resolves at render time; it just disappears from future picker results.
    const { data, error } = await service
      .from("podcast_personas")
      .update({ status: "removed" })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[podcast-personas] DELETE failed:", error.message);
      return NextResponse.json({ error: "Could not remove the persona" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "Persona not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/podcast-personas:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
