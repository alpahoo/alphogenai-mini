import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { GET, POST, PATCH, DELETE } from "./route";

vi.mock("@/lib/podcast/auth", () => ({ getUserFromRequest: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

const USER = { id: "user-1" };

type Result = { data?: unknown; error?: unknown };
type Call = { table: string; op: string; filters: Record<string, unknown>; payload: unknown };

/** Minimal Supabase-like mock: records ops, returns configured results by
 *  `${table}:${op}`, and stubs storage.createSignedUrl (→ `signed:<path>`). */
function makeService(routes: Record<string, (c: Call) => Result>, calls: Call[] = []) {
  function builder(table: string) {
    const st: Call = { table, op: "select", filters: {}, payload: undefined };
    const run = () => {
      if (["insert", "update", "delete"].includes(st.op)) calls.push({ ...st });
      return Promise.resolve(routes[`${st.table}:${st.op}`]?.(st) ?? { data: null, error: null });
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (rows: unknown) => { st.op = "insert"; st.payload = rows; return b; },
      update: (obj: unknown) => { st.op = "update"; st.payload = obj; return b; },
      delete: () => { st.op = "delete"; return b; },
      eq: (k: string, v: unknown) => { st.filters[k] = v; return b; },
      or: (expr: string) => { st.filters.__or = expr; return b; },
      order: () => b,
      single: () => run(),
      maybeSingle: () => run(),
      then: (resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
    };
    return b;
  }
  return {
    from: (t: string) => builder(t),
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `signed:${path}` }, error: null }),
      }),
    },
  };
}

const req = (opts: { auth?: boolean; body?: unknown; url?: string } = {}) =>
  ({
    headers: { get: (k: string) => (k.toLowerCase() === "authorization" && opts.auth !== false ? "Bearer tok" : null) },
    json: async () => opts.body ?? {},
    url: opts.url ?? "http://localhost/api/podcast-personas",
  }) as never;

function persona(over: Partial<Call & Record<string, unknown>> = {}) {
  return {
    id: "p-1",
    user_id: USER.id,
    source_kind: "generated",
    name: "Persona 1",
    portrait_path: "podcast-personas/user-1/a.png",
    thumb_path: null,
    status: "active",
    created_at: "2026-07-02T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserFromRequest).mockResolvedValue(USER);
});

describe("GET /api/podcast-personas", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await GET(req({ auth: false }))).status).toBe(401);
  });

  it("returns catalog + own, catalog first, with resolved URLs", async () => {
    const rows = [
      persona({ id: "own", user_id: USER.id, portrait_path: "podcast-personas/user-1/a.png" }),
      persona({ id: "cat", user_id: null, source_kind: "catalog", portrait_path: "https://cdn.example.com/cat.png" }),
    ];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcast_personas:select": () => ({ data: rows, error: null }) }) as never,
    );
    const res = await GET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.personas).toHaveLength(2);
    // Catalog first.
    expect(json.personas[0].id).toBe("cat");
    expect(json.personas[0].is_catalog).toBe(true);
    // Public catalog URL passes through; private path is signed.
    expect(json.personas[0].portrait_url).toBe("https://cdn.example.com/cat.png");
    expect(json.personas[1].portrait_url).toBe("signed:podcast-personas/user-1/a.png");
  });

  it("scopes the query to own OR catalog", async () => {
    let seenOr = "";
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({
        "podcast_personas:select": (c) => { seenOr = String(c.filters.__or); return { data: [], error: null }; },
      }) as never,
    );
    await GET(req());
    expect(seenOr).toContain("user_id.eq.user-1");
    expect(seenOr).toContain("user_id.is.null");
  });
});

describe("POST /api/podcast-personas", () => {
  it("401 without auth", async () => {
    vi.mocked(getUserFromRequest).mockResolvedValue(null);
    expect((await POST(req({ auth: false, body: {} }))).status).toBe(401);
  });

  it("400 without a name", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    expect((await POST(req({ body: { source_kind: "generated", portrait_path: "x" } }))).status).toBe(400);
  });

  it("400 rejects a persona name that references a public figure (T-1136f)", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ body: { name: "Elon Musk", source_kind: "generated", portrait_path: "podcast-personas/user-1/g.png" } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json()).toLowerCase()).toContain("public figure");
  });

  it("400 rejects user-created 'catalog' source_kind", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ body: { name: "X", source_kind: "catalog", portrait_path: "x" } }));
    expect(res.status).toBe(400);
  });

  it("400 without portrait_path", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    expect((await POST(req({ body: { name: "X", source_kind: "generated" } }))).status).toBe(400);
  });

  it("400 for an uploaded persona without consent", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ body: { name: "Me", source_kind: "uploaded", portrait_path: "podcast-personas/user-1/me.png" } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json()).toLowerCase()).toContain("consent");
  });

  it("stamps consent when an uploaded persona is confirmed", async () => {
    const calls: Call[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(
        { "podcast_personas:insert": (c) => ({ data: persona({ ...(c.payload as object), id: "new", source_kind: "uploaded" }), error: null }) },
        calls,
      ) as never,
    );
    const res = await POST(req({ body: { name: "Me", source_kind: "uploaded", portrait_path: "podcast-personas/user-1/me.png", consent: true } }));
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.op === "insert")!.payload as Record<string, unknown>;
    expect(insert.user_id).toBe("user-1");
    expect(insert.source_kind).toBe("uploaded");
    expect(insert.consent_confirmed_at).toBeTruthy();
    expect(insert.consent_statement_version).toBeTruthy();
  });

  it("creates a generated persona without consent fields", async () => {
    const calls: Call[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(
        { "podcast_personas:insert": (c) => ({ data: persona({ ...(c.payload as object), id: "new" }), error: null }) },
        calls,
      ) as never,
    );
    const res = await POST(req({ body: { name: "AI Guest", source_kind: "generated", portrait_path: "podcast-personas/user-1/g.png" } }));
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.op === "insert")!.payload as Record<string, unknown>;
    expect(insert.consent_confirmed_at).toBeUndefined();
    expect(insert.consent_statement_version).toBeUndefined();
    expect(insert.user_id).toBe("user-1");
  });

  it("400 rejects a public http(s) portrait_path (private storage paths only)", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ body: { name: "X", source_kind: "generated", portrait_path: "https://cdn.example.com/g.png" } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json()).toLowerCase()).toContain("portrait_path");
  });

  it("400 rejects a public http(s) thumb_path", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    const res = await POST(req({ body: { name: "X", source_kind: "generated", portrait_path: "podcast-personas/user-1/g.png", thumb_path: "http://cdn.example.com/t.png" } }));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json()).toLowerCase()).toContain("thumb_path");
  });
});

describe("PATCH /api/podcast-personas", () => {
  it("400 without id or name", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    expect((await PATCH(req({ body: { name: "X" } }))).status).toBe(400);
    expect((await PATCH(req({ body: { id: "p-1" } }))).status).toBe(400);
  });

  it("404 when the persona is not the caller's", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcast_personas:update": () => ({ data: null, error: null }) }) as never,
    );
    const res = await PATCH(req({ body: { id: "other", name: "New" } }));
    expect(res.status).toBe(404);
  });

  it("renames the caller's own persona (scoped by user_id)", async () => {
    const calls: Call[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(
        { "podcast_personas:update": (c) => ({ data: persona({ name: (c.payload as { name: string }).name }), error: null }) },
        calls,
      ) as never,
    );
    const res = await PATCH(req({ body: { id: "p-1", name: "Renamed" } }));
    expect(res.status).toBe(200);
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.payload).toEqual({ name: "Renamed" });
    expect(upd.filters.user_id).toBe("user-1");
    expect((await res.json()).persona.name).toBe("Renamed");
  });
});

describe("DELETE /api/podcast-personas", () => {
  it("400 without id", async () => {
    vi.mocked(createServiceClient).mockReturnValue(makeService({}) as never);
    expect((await DELETE(req({ url: "http://localhost/api/podcast-personas" }))).status).toBe(400);
  });

  it("404 when the persona is not the caller's", async () => {
    vi.mocked(createServiceClient).mockReturnValue(
      makeService({ "podcast_personas:update": () => ({ data: null, error: null }) }) as never,
    );
    const res = await DELETE(req({ url: "http://localhost/api/podcast-personas?id=other" }));
    expect(res.status).toBe(404);
  });

  it("soft-removes (status='removed') scoped by user_id", async () => {
    const calls: Call[] = [];
    vi.mocked(createServiceClient).mockReturnValue(
      makeService(
        { "podcast_personas:update": () => ({ data: { id: "p-1" }, error: null }) },
        calls,
      ) as never,
    );
    const res = await DELETE(req({ url: "http://localhost/api/podcast-personas?id=p-1" }));
    expect(res.status).toBe(200);
    const upd = calls.find((c) => c.op === "update")!;
    expect(upd.payload).toEqual({ status: "removed" });
    expect(upd.filters.id).toBe("p-1");
    expect(upd.filters.user_id).toBe("user-1");
  });
});
