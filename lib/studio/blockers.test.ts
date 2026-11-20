import { describe, expect, it } from "vitest";
import { parseServerBlockers, studioBlockers } from "./blockers";

const ready = { ready: true, loaded: true, reason: "Authorized GPU runs are available" };
const base = { modelAvailable: true, readiness: ready, activeRun: false, hasVariant: true, errors: {} };

describe("Generate blockers", () => {
  it("is empty when everything is in order", () => {
    expect(studioBlockers(base)).toEqual([]);
  });

  it("shows every server reason as an owner reason, with its exact message", () => {
    const readiness = { ready: false, loaded: true, reason: "GPU authorization is off.", blockers: [
      { code: "gate_disabled", message: "GPU authorization is off." },
      { code: "budget_insufficient", message: "Not enough unreserved budget for one run (one run reserves $0.75, $0.00 left)." },
    ] };
    expect(studioBlockers({ ...base, readiness })).toEqual([
      { kind: "owner", code: "gate_disabled", message: "GPU authorization is off." },
      { kind: "owner", code: "budget_insufficient", message: "Not enough unreserved budget for one run (one run reserves $0.75, $0.00 left)." },
    ]);
  });

  it("falls back to the server reason when no list is sent", () => {
    expect(studioBlockers({ ...base, readiness: { ready: false, loaded: true, reason: "Runtime is not configured" } }))
      .toEqual([{ kind: "owner", message: "Runtime is not configured" }]);
  });

  it("separates form problems and waits from owner authorization", () => {
    const out = studioBlockers({ ...base, readiness: { ready: false, loaded: false, reason: "" }, activeRun: true, hasVariant: false, errors: { prompt: "Prompt is required", steps: "Too high" } });
    expect(out.map(b => b.kind)).toEqual(["wait", "wait", "form", "form"]);
    expect(out.map(b => b.message)).toContain("A generation is already in progress.");
    expect(out.map(b => b.message)).toContain("Fix the highlighted settings.");
  });

  it("shows a single prompt error as is", () => {
    expect(studioBlockers({ ...base, errors: { prompt: "Prompt is required" } })).toEqual([{ kind: "form", message: "Prompt is required" }]);
  });

  it("explains an unavailable model", () => {
    expect(studioBlockers({ ...base, modelAvailable: false, pendingReason: "Licence pending" })).toEqual([{ kind: "owner", message: "Licence pending" }]);
  });

  it("reads server blockers defensively", () => {
    expect(parseServerBlockers(null)).toEqual([]);
    expect(parseServerBlockers([{ code: 1, message: "x" }, "x", { code: "a", message: "m".repeat(500) }])).toEqual([{ code: "a", message: "m".repeat(200) }]);
    expect(parseServerBlockers(Array.from({ length: 50 }, () => ({ code: "a", message: "b" })))).toHaveLength(12);
  });
});
