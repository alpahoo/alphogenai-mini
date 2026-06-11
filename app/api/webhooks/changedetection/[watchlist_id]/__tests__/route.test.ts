import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/supabase-js");

import { createClient } from "@supabase/supabase-js";
import { POST } from "../route";

const mockCreateClient = createClient as unknown as ReturnType<typeof vi.fn>;

const SECRET = "test-secret-123";

interface Capture {
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown>;
}

// Supabase service-client mock: records insert/update payloads and resolves
// each awaited terminal from a FIFO response queue.
function makeServiceMock(responses: Array<{ data: unknown; error: unknown }>) {
  const captures: Capture[] = [];
  let i = 0;
  const next = () => (i < responses.length ? responses[i++] : { data: null, error: null });

  const from = (table: string) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      insert: (payload: Record<string, unknown>) => {
        captures.push({ table, op: "insert", payload });
        return b;
      },
      update: (payload: Record<string, unknown>) => {
        captures.push({ table, op: "update", payload });
        return b;
      },
      single: () => Promise.resolve(next()),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(next()).then(resolve, reject),
    };
    return b;
  };

  return { client: { from }, captures };
}

function makeRequest(opts: { secret?: string; body?: unknown; rawBody?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.secret) headers["x-webhook-secret"] = opts.secret;
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: "POST",
    headers,
  };
  if (opts.rawBody !== undefined) init.body = opts.rawBody;
  else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return new NextRequest("http://localhost/api/webhooks/changedetection/wl-1", init);
}

const activeWatchlist = {
  id: "wl-1",
  user_id: "user-1",
  name: "My Watch",
  topic: "AI news",
  url: "https://watched.example.com/page",
  mode: "news",
  status: "active",
};

describe("POST /api/webhooks/changedetection/[watchlist_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.CHANGEDETECTION_WEBHOOK_SECRET = SECRET;
  });

  it("returns 401 without secret", async () => {
    const res = await POST(makeRequest({ body: {} }), {
      params: Promise.resolve({ watchlist_id: "wl-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const res = await POST(makeRequest({ secret: "nope", body: {} }), {
      params: Promise.resolve({ watchlist_id: "wl-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("accepts the Authorization: Bearer form", async () => {
    const { client } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const req = new NextRequest("http://localhost/api/webhooks/changedetection/wl-1", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ title: "t", message: "m" }),
    });
    const res = await POST(req, { params: Promise.resolve({ watchlist_id: "wl-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 404 when watchlist not found", async () => {
    const { client } = makeServiceMock([{ data: null, error: { code: "PGRST116" } }]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(makeRequest({ secret: SECRET, body: { title: "x" } }), {
      params: Promise.resolve({ watchlist_id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("ignores paused watchlists without creating a job", async () => {
    const { client, captures } = makeServiceMock([
      { data: { ...activeWatchlist, status: "paused" }, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(makeRequest({ secret: SECRET, body: { title: "x" } }), {
      params: Promise.resolve({ watchlist_id: "wl-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe(true);
    expect(json.reason).toBe("watchlist_paused");
    expect(captures.find((c) => c.table === "research_jobs")).toBeUndefined();
  });

  it("creates a draft job + draft_created event on success", async () => {
    const { client, captures } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(
      makeRequest({
        secret: SECRET,
        body: { title: "Price changed", message: "Old 10 -> New 12", url: "https://watched.example.com/page" },
      }),
      { params: Promise.resolve({ watchlist_id: "wl-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("draft_created");
    expect(json.research_job_id).toBe("job-1");

    const jobInsert = captures.find((c) => c.table === "research_jobs" && c.op === "insert");
    expect(jobInsert).toBeTruthy();
    expect(jobInsert!.payload.status).toBe("draft");
    expect(jobInsert!.payload.user_id).toBe("user-1");
    expect(jobInsert!.payload.input_url).toBe("https://watched.example.com/page");
    expect(jobInsert!.payload.topic).toContain("Price changed");

    const eventInsert = captures.find(
      (c) => c.table === "research_watchlist_events" && c.op === "insert",
    );
    expect(eventInsert).toBeTruthy();
    expect(eventInsert!.payload.status).toBe("draft_created");
    expect(eventInsert!.payload.summary).toBe("Old 10 -> New 12");
    expect(eventInsert!.payload.title).toBe("Price changed");
  });

  it("falls back to watchlist.url when body omits url", async () => {
    const { client, captures } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(
      makeRequest({ secret: SECRET, body: { title: "T", message: "M" } }),
      { params: Promise.resolve({ watchlist_id: "wl-1" }) },
    );

    expect(res.status).toBe(200);
    const jobInsert = captures.find((c) => c.table === "research_jobs" && c.op === "insert");
    expect(jobInsert!.payload.input_url).toBe(activeWatchlist.url);
    const eventInsert = captures.find(
      (c) => c.table === "research_watchlist_events" && c.op === "insert",
    );
    expect(eventInsert!.payload.source_url).toBe(activeWatchlist.url);
  });

  it("falls back to watchlist.url when body url is invalid", async () => {
    const { client, captures } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(
      makeRequest({ secret: SECRET, body: { url: "not-a-url", message: "M" } }),
      { params: Promise.resolve({ watchlist_id: "wl-1" }) },
    );

    expect(res.status).toBe(200);
    const jobInsert = captures.find((c) => c.table === "research_jobs" && c.op === "insert");
    expect(jobInsert!.payload.input_url).toBe(activeWatchlist.url);
  });

  it("tolerates a non-JSON body and still creates a draft from watchlist.url", async () => {
    const { client, captures } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(
      makeRequest({ secret: SECRET, rawBody: "this is not json {" }),
      { params: Promise.resolve({ watchlist_id: "wl-1" }) },
    );

    expect(res.status).toBe(200);
    const jobInsert = captures.find((c) => c.table === "research_jobs" && c.op === "insert");
    expect(jobInsert!.payload.input_url).toBe(activeWatchlist.url);
    expect(jobInsert!.payload.topic).toBe(activeWatchlist.topic);
  });

  it("extracts summary from body before message/text precedence", async () => {
    const { client, captures } = makeServiceMock([
      { data: activeWatchlist, error: null },
      { data: { id: "job-1", status: "draft" }, error: null },
      { data: { id: "ev-1" }, error: null },
      { data: null, error: null },
    ]);
    mockCreateClient.mockReturnValue(client);

    const res = await POST(
      makeRequest({ secret: SECRET, body: { body: "from-body-field", text: "from-text" } }),
      { params: Promise.resolve({ watchlist_id: "wl-1" }) },
    );

    expect(res.status).toBe(200);
    const eventInsert = captures.find(
      (c) => c.table === "research_watchlist_events" && c.op === "insert",
    );
    // message absent -> body wins over text
    expect(eventInsert!.payload.summary).toBe("from-body-field");
  });
});
