import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin } from "@/app/api/admin/middleware";
import { getAssistantProvider } from "@/lib/studio/agent/provider";
import { groqQwenProvider } from "@/lib/studio/agent/groq";
import { call, scriptedProvider } from "@/lib/studio/agent/fake-provider";
import { assistantRateLimiter } from "@/lib/studio/agent/rate-limit";
import { GET, POST } from "./route";

vi.mock("@/app/api/admin/middleware", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/studio/agent/provider", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/studio/agent/provider")>()),
  getAssistantProvider: vi.fn(),
}));

const post = (body: unknown) => POST(new Request("http://localhost/api/admin/studio/assistant", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
const valid = { template: "moss-image", values: { prompt: "A red bicycle", steps: 25, cfg: 2.5 }, messages: [{ role: "user", content: "More detail please" }] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(requireAdmin).mockResolvedValue({ user: { id: `admin-${Math.random()}`, email: "admin@example.com" } });
  vi.mocked(getAssistantProvider).mockReturnValue({ enabled: false, reason: "no_provider" });
});

describe("POST /api/admin/studio/assistant", () => {
  it("rejects non-admins before anything else", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ response: new Response("Forbidden", { status: 403 }) as never });
    expect((await post(valid)).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect(getAssistantProvider).not.toHaveBeenCalled();
  });

  it("is closed (503) while no provider is approved, and reports it on GET", async () => {
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const ready = await (await GET()).json();
    expect(ready).toMatchObject({ enabled: false, reason: expect.stringMatching(/No language model/), limits: { max_messages: 20 } });
    expect(JSON.stringify(ready)).not.toMatch(/key|price|usd_per_mtok/i);
  });

  it("validates the request before calling the model", async () => {
    const { provider, calls } = scriptedProvider([{ text: "never" }]);
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider });
    expect((await post("{")).status).toBe(400);
    expect((await post({ ...valid, template: "unknown" })).status).toBe(400);
    expect((await post({ ...valid, messages: [{ role: "assistant", content: "hi" }] })).status).toBe(400);
    expect(calls()).toBe(0);
  });

  it("returns the reply, a validated patch and usage; never generates", async () => {
    const { provider } = scriptedProvider([
      { toolCalls: [call("propose_patch", { changes: { steps: 40 }, rationale: "More detail." })] },
      { text: "Try 40 steps." },
    ]);
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post(valid);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ reply: "Try 40 steps.", proposal: { patch: { steps: 40 }, rationale: "More detail." }, stop: "answered" });
    expect(data.usage).toMatchObject({ model_calls: 2, tool_calls: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });


  it.each([
    ["portrait", "Prepare an artistic portrait of a fictional adult.", "Fine-art portrait of a fictional adult, soft window light."],
    ["figure study", "Prepare a non-sexual, non-explicit nude study of a fictional adult.", "Non-explicit fine-art nude figure study of a fictional adult, classical sculpture composition."],
    ["fashion", "Prepare an editorial fashion photograph.", "Editorial fashion photograph, tailored coat, directional studio lighting."],
    ["cinematic", "Prepare a cinematic still with an adult actor.", "Cinematic still of an adult actor at an empty station, soft dawn light."],
  ])("forwards the %s request and validates the proposed settings", async (_label, content, prompt) => {
    const requestFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        choices: [{
          finish_reason: "tool_calls",
          message: {
            tool_calls: [{
              id: "call_a",
              function: { name: "propose_patch", arguments: JSON.stringify({ changes: { prompt, steps: 40 } }) },
            }],
          },
        }],
      }))
      .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: "Proposal ready." } }] }));
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider: groqQwenProvider("test-key", requestFetch) });

    const res = await post({ ...valid, messages: [{ role: "user", content }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      stop: "answered", proposal: { patch: { prompt, steps: 40 } }, refused: [],
    });
    expect(requestFetch).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(requestFetch.mock.calls[0][1]?.body));
    expect(payload.messages[0].content).toContain("MOSS-Image");
    expect(payload.messages[1]).toEqual({ role: "user", content });
    expect(payload.tools.map((tool: { function: { name: string } }) => tool.function.name))
      .toEqual(["get_config", "describe_param", "propose_patch"]);
  });

  // Category labels only. These cases test refusal handling, not the model's classification.
  it.each([
    ["[sexual exploitation of minors]", "stop", { content: "I can't help with that request." }, "answered"],
    ["[non-consensual intimate imagery]", "content_filter", {}, "refusal"],
    ["[illegal sexual content]", "stop", { refusal: "Refused" }, "refusal"],
  ] as const)("returns a simulated refusal for %s without a proposal", async (content, finish, message, stop) => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      choices: [{ finish_reason: finish, message }],
    }));
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider: groqQwenProvider("test-key", requestFetch) });

    const res = await post({ ...valid, messages: [{ role: "user", content }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      reply: "I can't help with that request.", stop, proposal: null, refused: [],
    });
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });

  it("reports a Groq HTTP error separately from a refusal", async () => {
    const requestFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider details", { status: 429 }));
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider: groqQwenProvider("test-key", requestFetch) });

    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      reply: "The assistant is unavailable right now.", stop: "provider_error", proposal: null, refused: [],
    });
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });

  it("logs counters only, never the conversation or the values", async () => {
    const { provider } = scriptedProvider([{ text: "Secret reply text" }]);
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider });
    await post(valid);
    const logged = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(logged).toContain("studio_assistant");
    expect(logged).not.toMatch(/red bicycle|More detail please|Secret reply/);
  });

  it("rate-limits per admin (429)", async () => {
    const { provider } = scriptedProvider(Array.from({ length: 30 }, () => ({ text: "ok" })));
    vi.mocked(getAssistantProvider).mockReturnValue({ enabled: true, provider });
    vi.mocked(requireAdmin).mockResolvedValue({ user: { id: "admin-rate", email: "admin@example.com" } });
    const spy = vi.spyOn(assistantRateLimiter, "acquire").mockReturnValueOnce({ ok: false, reason: "rate" });
    expect((await post(valid)).status).toBe(429);
    spy.mockRestore();
  });
});
