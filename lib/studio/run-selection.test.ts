import { describe, expect, it, vi } from "vitest";
import { RunSelection } from "./run-selection";

type Run = { id: string; status: string; assets: { id: string; role: string }[] };
const run = (id: string, status = "done"): Run => ({ id, status, assets: [{ id: `${id}-final`, role: "final" }, { id: `${id}-raw`, role: "raw" }] });

/** Fetcher whose responses resolve/reject in the order the test decides. */
function controlledFetcher() {
  const pending = new Map<string, { resolve: (r: Run) => void; reject: (e: unknown) => void; signal: AbortSignal }[]>();
  const fetcher = (id: string, signal: AbortSignal) => new Promise<Run>((resolve, reject) => {
    pending.set(id, [...(pending.get(id) ?? []), { resolve, reject, signal }]);
  });
  const next = (id: string) => { const list = pending.get(id)!; const item = list.shift()!; return item; };
  return { fetcher, next };
}

function screen() {
  // Mirrors what the hook renders: the displayed run, its download targets, and the error banner.
  const state = { shown: null as Run | null, error: "" };
  const apply = (r: Run) => { state.shown = r; };
  const onError = () => { state.error = "unavailable"; };
  return { state, apply, onError, downloads: () => state.shown?.assets.map(a => a.id) ?? [] };
}

describe("RunSelection: stale responses never replace the selected run", () => {
  it("A then B selected, B answers first, late A is ignored", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const a = sel.load("A", f.fetcher, ui.apply, ui.onError);
    sel.select("B"); const b = sel.load("B", f.fetcher, ui.apply, ui.onError);
    f.next("B").resolve(run("B")); await b;
    const lateA = f.next("A"); expect(lateA.signal.aborted).toBe(true);
    lateA.resolve(run("A")); expect(await a).toBeNull();
    expect(ui.state.shown?.id).toBe("B");
    expect(ui.downloads()).toEqual(["B-final", "B-raw"]);
  });

  it("A answers after B is selected but before B answers: still dropped", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const a = sel.load("A", f.fetcher, ui.apply, ui.onError);
    sel.select("B"); const b = sel.load("B", f.fetcher, ui.apply, ui.onError);
    f.next("A").resolve(run("A")); await a;
    expect(ui.state.shown).toBeNull();
    f.next("B").resolve(run("B")); await b;
    expect(ui.state.shown?.id).toBe("B");
  });

  it("a late polling response for A after selecting B is ignored", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const first = sel.load("A", f.fetcher, ui.apply, ui.onError);
    f.next("A").resolve(run("A", "running")); await first;
    const poll = sel.load("A", f.fetcher, ui.apply, ui.onError); // poll tick in flight
    sel.select("B"); const b = sel.load("B", f.fetcher, ui.apply, ui.onError);
    f.next("B").resolve(run("B")); await b;
    f.next("A").resolve(run("A", "done")); expect(await poll).toBeNull();
    expect(ui.state.shown?.id).toBe("B");
  });

  it("a late error from A does not mask B", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const a = sel.load("A", f.fetcher, ui.apply, ui.onError);
    sel.select("B"); const b = sel.load("B", f.fetcher, ui.apply, ui.onError);
    f.next("B").resolve(run("B")); await b;
    f.next("A").reject(new Error("503")); await a;
    expect(ui.state.error).toBe("");
    expect(ui.state.shown?.id).toBe("B");
  });

  it("reports errors for the current selection", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const a = sel.load("A", f.fetcher, ui.apply, ui.onError);
    f.next("A").reject(new Error("404")); await a;
    expect(ui.state.error).toBe("unavailable");
  });

  it("drops a payload whose id does not match the request", async () => {
    const sel = new RunSelection<Run>(); const ui = screen();
    sel.select("A");
    expect(await sel.load("A", async () => run("Z"), ui.apply, ui.onError)).toBeNull();
    expect(ui.state.shown).toBeNull();
  });

  it("does not load a run that is not selected", async () => {
    const sel = new RunSelection<Run>(); const fetcher = vi.fn(); const ui = screen();
    sel.select("B");
    expect(await sel.load("A", fetcher, ui.apply, ui.onError)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reload: a fresh selection from the URL shows that run", async () => {
    const fromUrl = new URLSearchParams("?model=minimax-h3&run=B").get("run")!;
    const sel = new RunSelection<Run>(); const ui = screen();
    sel.select(fromUrl);
    await sel.load(fromUrl, async id => run(id), ui.apply, ui.onError);
    expect(ui.state.shown?.id).toBe("B");
    expect(ui.downloads()).toEqual(["B-final", "B-raw"]);
  });

  it("reselecting the same run keeps its in-flight request valid", async () => {
    const sel = new RunSelection<Run>(); const f = controlledFetcher(); const ui = screen();
    sel.select("A"); const a = sel.load("A", f.fetcher, ui.apply, ui.onError);
    sel.select("A");
    const item = f.next("A"); expect(item.signal.aborted).toBe(false);
    item.resolve(run("A")); await a;
    expect(ui.state.shown?.id).toBe("A");
  });
});
