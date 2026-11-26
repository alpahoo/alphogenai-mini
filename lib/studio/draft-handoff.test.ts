import { describe, expect, it } from "vitest";
import { findModel } from "./catalog";
import type { StudioManifest } from "./manifest";
import { HANDOFF_KEY, HANDOFF_MAX_AGE_MS, saveHandoff, takeHandoff } from "./draft-handoff";

const h3 = findModel("minimax-h3")!.manifest as StudioManifest;
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }; };
const ref = { path: "u/library/4c757a_1.png", previewUrl: "https://signed/x", name: "Luz" };

describe("Studio draft handoff (Video screen -> More settings)", () => {
  it("carries the prompt, settings and first frame once, for the same model", () => {
    const st = memory();
    saveHandoff({ model: "minimax-h3", values: { prompt: "Luz on the quay", seconds: 5, resolution: "704p" }, reference: ref }, st, 1000);
    expect(takeHandoff("minimax-h3", h3, st, 2000)).toEqual({ values: { prompt: "Luz on the quay", seconds: 5, resolution: "704p" }, reference: ref });
    expect(st.m.has(HANDOFF_KEY)).toBe(false);
    expect(takeHandoff("minimax-h3", h3, st, 2000)).toBeNull();
  });
  it("ignores another model, an old draft, undeclared keys and non-primitive values", () => {
    const st = memory();
    saveHandoff({ model: "moss-image", values: { prompt: "x" }, reference: null }, st, 0);
    expect(takeHandoff("minimax-h3", h3, st, 1)).toBeNull();
    saveHandoff({ model: "minimax-h3", values: { prompt: "x" }, reference: null }, st, 0);
    expect(takeHandoff("minimax-h3", h3, st, HANDOFF_MAX_AGE_MS + 1)).toBeNull();
    st.setItem(HANDOFF_KEY, JSON.stringify({ model: "minimax-h3", at: 0, values: { prompt: "ok", injected: "no", seconds: { a: 1 } }, reference: { path: 1 } }));
    expect(takeHandoff("minimax-h3", h3, st, 1)).toEqual({ values: { prompt: "ok" }, reference: null });
  });
  it("survives blocked or corrupt storage", () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => undefined };
    expect(() => saveHandoff({ model: "minimax-h3", values: {}, reference: null }, broken)).not.toThrow();
    expect(takeHandoff("minimax-h3", h3, broken)).toBeNull();
    const st = memory(); st.setItem(HANDOFF_KEY, "{not json");
    expect(takeHandoff("minimax-h3", h3, st)).toBeNull();
  });
});
