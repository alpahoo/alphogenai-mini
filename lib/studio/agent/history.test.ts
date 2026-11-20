import { describe, expect, it } from "vitest";
import { findModel } from "../catalog";
import { defaultValues, type StudioManifest } from "../manifest";
import { addEntry, HISTORY_LIMIT, historyEntry, loadHistory, saveHistory, type HistoryEntry } from "./history";
import { proposePatch } from "./patch";

const moss = findModel("moss-image")!;
const mm = moss.manifest as StudioManifest;

function proposal(id: string, patch: Record<string, string | number> = { steps: 30 }) {
  const r = proposePatch({ model: moss, manifest: mm, values: { ...defaultValues(mm), prompt: "A mug" }, hasReference: false }, patch, { id });
  if (!r.ok) throw new Error("expected ok");
  return r.proposal;
}

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, data };
}

describe("assistant history (local, bounded)", () => {
  it("records accepted and rejected proposals newest first, one entry per proposal", () => {
    let list: HistoryEntry[] = [];
    list = addEntry(list, historyEntry(proposal("a"), "accepted"));
    list = addEntry(list, historyEntry(proposal("b"), "rejected"));
    list = addEntry(list, historyEntry(proposal("a"), "rejected"));
    expect(list.map(e => [e.id, e.decision])).toEqual([["a", "rejected"], ["b", "rejected"]]);
    expect(list[0].changes).toEqual([{ key: "steps", label: "Steps", from: "25", to: "30" }]);
  });

  it(`keeps at most ${HISTORY_LIMIT} entries`, () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) list = addEntry(list, historyEntry(proposal(`p${i}`), "accepted"));
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0].id).toBe(`p${HISTORY_LIMIT + 4}`);
  });

  it("truncates long values (e.g. prompts) before storing", () => {
    const e = historyEntry(proposal("long", { prompt: "x".repeat(1500) }), "accepted");
    expect(e.changes[0].to.length).toBeLessThanOrEqual(201);
  });

  it("round-trips through storage per template, and ignores other templates", () => {
    const s = memoryStorage();
    const list = [historyEntry(proposal("a"), "accepted")];
    saveHistory(s, "moss-image@1", list);
    expect(loadHistory(s, "moss-image@1")).toEqual(list);
    expect(loadHistory(s, "minimax-h3@1")).toEqual([]);
  });

  it("drops malformed or foreign entries and survives broken storage", () => {
    const s = memoryStorage();
    s.setItem("alphogen.studio.assistant-history.v1:moss-image@1", JSON.stringify([
      { id: "x" }, null, "str", { ...historyEntry(proposal("ok"), "accepted") },
      { ...historyEntry(proposal("other"), "accepted"), template: "minimax-h3@1" },
      { ...historyEntry(proposal("bad"), "accepted"), decision: "generated" },
    ]));
    expect(loadHistory(s, "moss-image@1").map(e => e.id)).toEqual(["ok"]);
    s.setItem("alphogen.studio.assistant-history.v1:moss-image@1", "{not json");
    expect(loadHistory(s, "moss-image@1")).toEqual([]);
    const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(loadHistory(throwing, "moss-image@1")).toEqual([]);
    expect(() => saveHistory(throwing, "moss-image@1", [])).not.toThrow();
    expect(loadHistory(null, "moss-image@1")).toEqual([]);
  });
});
