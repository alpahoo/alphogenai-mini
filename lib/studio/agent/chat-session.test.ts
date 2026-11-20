import { describe, expect, it, vi } from "vitest";
import { AssistantChatSession, NOTES, type LiveStudio } from "./chat-session";

const OPTS = { enabled: true, maxChars: 2000, maxMessages: 20 };
const ANSWER = { reply: "Raise the steps.", proposal: { patch: { steps: 40 }, rationale: "Sharper" } };

/** A fetcher whose answer the test releases by hand, to simulate a slow model. */
function slowFetcher({ ignoreAbort = false } = {}) {
  const calls: { body: unknown; signal: AbortSignal; resolve: (r: { ok: boolean; data: unknown }) => void; reject: (e: unknown) => void }[] = [];
  const fetcher = vi.fn((body: string, signal: AbortSignal) => new Promise<{ ok: boolean; data: unknown }>((resolve, reject) => {
    calls.push({ body: JSON.parse(body), signal, resolve, reject });
    if (!ignoreAbort) signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  }));
  return { fetcher, calls };
}

function studio(over: Partial<LiveStudio> = {}) {
  const state: LiveStudio = { template: "moss-image", values: { prompt: "A mug", steps: 25 }, referencePath: null, propose: vi.fn(() => ({ id: "p" })), ...over };
  return { state, live: () => state };
}

describe("assistant chat session: answers", () => {
  it("shows the reply and passes the proposal to the C2a engine", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio();
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Sharper please", OPTS);
    expect(chat.getView()).toMatchObject({ pending: true, entries: [{ role: "user", content: "Sharper please" }] });
    calls[0].resolve({ ok: true, data: ANSWER });
    expect(await done).toBe("answered");
    expect(state.propose).toHaveBeenCalledWith({ steps: 40 }, "Sharper");
    expect(chat.getView()).toMatchObject({ pending: false, error: "" });
    expect(chat.getView().entries[1]).toMatchObject({ role: "assistant", content: "Raise the steps.", note: NOTES.shown });
  });

  it("keeps no failed question and never leaks a non-string error", async () => {
    const { fetcher, calls } = slowFetcher();
    const chat = new AssistantChatSession(fetcher, studio().live);
    const done = chat.send("Hi", OPTS);
    calls[0].resolve({ ok: false, data: { error: { secret: 1 } } });
    expect(await done).toBe("failed");
    expect(chat.getView()).toEqual({ entries: [], pending: false, error: "The assistant did not answer." });
  });

  it("refuses to send while disabled, busy, too long or full", async () => {
    const { fetcher } = slowFetcher();
    const chat = new AssistantChatSession(fetcher, studio().live);
    expect(await chat.send("hi", { ...OPTS, enabled: false })).toBe("refused");
    expect(await chat.send("x".repeat(2001), OPTS)).toBe("refused");
    expect(await chat.send("hi", { ...OPTS, maxMessages: 1 })).toBe("refused");
    void chat.send("first", OPTS);
    expect(await chat.send("second", OPTS)).toBe("refused");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("assistant chat session: late answers", () => {
  it("drops the answer when the model changes during the request", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio();
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Sharper", OPTS);
    state.template = "minimax-h3"; // the admin switched model; the answer belongs to MOSS
    calls[0].resolve({ ok: true, data: ANSWER });
    expect(await done).toBe("dropped");
    expect(state.propose).not.toHaveBeenCalled();
    expect(chat.getView()).toEqual({ entries: [], pending: false, error: "" });
  });

  it("drops the answer when the model changed and the hook already reset the conversation", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio();
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Sharper", OPTS);
    state.template = "minimax-h3";
    chat.reset(); // what the hook does on a model switch
    expect(calls[0].signal.aborted).toBe(true);
    expect(await done).toBe("dropped");
    // A late answer for the old model cannot touch the new conversation.
    const newer = chat.send("Question for H3", OPTS);
    calls[0].resolve({ ok: true, data: ANSWER });
    calls[1].resolve({ ok: true, data: { reply: "H3 answer", proposal: null } });
    expect(await newer).toBe("answered");
    expect(state.propose).not.toHaveBeenCalled();
    expect(chat.getView().entries.map(e => e.content)).toEqual(["Question for H3", "H3 answer"]);
  });

  it("ignores an answer that arrives after 'New conversation', even if the request was not aborted in time", async () => {
    const { fetcher, calls } = slowFetcher({ ignoreAbort: true });
    const { state, live } = studio();
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Sharper", OPTS);
    chat.reset();
    calls[0].resolve({ ok: true, data: ANSWER }); // the response was already on its way
    expect(await done).toBe("dropped");
    expect(state.propose).not.toHaveBeenCalled();
    expect(chat.getView()).toEqual({ entries: [], pending: false, error: "" });
  });

  it("ignores a late failure after reset (no error shown, no conversation restored)", async () => {
    const { fetcher, calls } = slowFetcher({ ignoreAbort: true });
    const chat = new AssistantChatSession(fetcher, studio().live);
    const done = chat.send("Sharper", OPTS);
    chat.reset();
    calls[0].resolve({ ok: false, data: { error: "Too many requests." } });
    expect(await done).toBe("dropped");
    expect(chat.getView()).toEqual({ entries: [], pending: false, error: "" });
  });

  it("ignores everything once the panel is closed (unmounted)", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio();
    const chat = new AssistantChatSession(fetcher, live);
    const listener = vi.fn();
    chat.subscribe(listener);
    const done = chat.send("Sharper", OPTS);
    listener.mockClear();
    chat.dispose();
    expect(calls[0].signal.aborted).toBe(true);
    expect(await done).toBe("dropped");
    expect(state.propose).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("never applies a proposal made for reference A once B replaced it", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio({ template: "minimax-h3", values: {}, referencePath: "u/A.png" });
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Better framing", OPTS);
    expect(calls[0].body).toMatchObject({ reference_id: "u/A.png" });
    state.referencePath = "u/B.png";
    calls[0].resolve({ ok: true, data: ANSWER });
    expect(await done).toBe("answered");
    expect(state.propose).not.toHaveBeenCalled();
    expect(chat.getView().entries[1]).toMatchObject({ content: "Raise the steps.", note: NOTES.referenceChanged });
  });

  it.each([
    ["removed", "u/A.png", null],
    ["attached", null, "u/B.png"],
  ])("drops the proposal when the reference was %s during the answer", async (_, from, to) => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio({ template: "minimax-h3", values: {}, referencePath: from });
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Better framing", OPTS);
    state.referencePath = to;
    calls[0].resolve({ ok: true, data: ANSWER });
    await done;
    expect(state.propose).not.toHaveBeenCalled();
    expect(chat.getView().entries[1].note).toBe(NOTES.referenceChanged);
  });

  it("re-validates against the CURRENT form when only the settings changed", async () => {
    const { fetcher, calls } = slowFetcher();
    const seen: unknown[] = [];
    const state: LiveStudio = { template: "moss-image", values: { prompt: "A mug", steps: 25 }, referencePath: null, propose: vi.fn() };
    // Each render installs a new C2a `propose` bound to that render's form, as the hook does.
    const install = () => { const v = state.values; state.propose = vi.fn(() => { seen.push(v); return { id: "p" }; }); };
    install();
    const chat = new AssistantChatSession(fetcher, () => state);
    const done = chat.send("Sharper", OPTS);
    state.values = { prompt: "A blue mug", steps: 30 }; install();
    calls[0].resolve({ ok: true, data: ANSWER });
    await done;
    expect(seen).toEqual([{ prompt: "A blue mug", steps: 30 }]);
    expect(chat.getView().entries[1].note).toBe(NOTES.rechecked);
  });

  it("reports a proposal the current form refuses", async () => {
    const { fetcher, calls } = slowFetcher();
    const { state, live } = studio({ propose: vi.fn(() => null) });
    const chat = new AssistantChatSession(fetcher, live);
    const done = chat.send("Sharper", OPTS);
    state.values = { prompt: "", steps: 25 };
    calls[0].resolve({ ok: true, data: ANSWER });
    await done;
    expect(chat.getView().entries[1].note).toBe(NOTES.noLongerFits);
  });

  it("sends the form as it was when the question was asked", async () => {
    const { fetcher, calls } = slowFetcher();
    const chat = new AssistantChatSession(fetcher, studio().live);
    void chat.send("Sharper", OPTS);
    expect(calls[0].body).toEqual({ template: "moss-image", values: { prompt: "A mug", steps: 25 }, has_reference: false, messages: [{ role: "user", content: "Sharper" }] });
  });
});
