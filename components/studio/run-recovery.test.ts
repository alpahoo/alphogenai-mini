import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const hook = readFileSync("components/studio/use-studio.ts", "utf8");

describe("Studio reopens an abandoned active run", () => {
  it("reopens the most recent active run when the URL names none, so it is polled and expired server-side", () => {
    expect(hook).toMatch(/refreshHistory\(\)\.then\(items =>/);
    expect(hook).toMatch(/items\.find\(r => isActive\(r\.status\)\)/);
    expect(hook).toMatch(/if \(run \|\| !items \|\| selection\.current\) return;/);
  });
  it("never starts a run while reopening: only a status read", () => {
    const block = hook.slice(hook.indexOf("refreshHistory().then"), hook.indexOf("}, [openRun, refreshHistory, selection])"));
    expect(block).not.toMatch(/generate|retryDispatch|method: "POST"|idempotency/);
  });
  it("a double click or a network retry reuses one idempotency key", () => {
    expect(hook).toMatch(/pendingKey\.current \?\?= crypto\.randomUUID\(\)/);
    expect(hook).toMatch(/const canGenerate = blockers\.length === 0 && busy === "idle"/);
    expect(hook).toMatch(/if \(!manifest \|\| !canGenerate\) return;/);
  });
});
