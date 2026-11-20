import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(path.join(__dirname, name), "utf8");

describe("Studio narrow viewport layout regression", () => {
  it("constrains the main grid and its result column rather than widening the document", () => {
    const studio = source("studio.tsx");
    expect(studio).toContain("grid min-h-0 min-w-0 flex-1 overflow-x-hidden");
    expect(studio).toContain("min-h-0 min-w-0 flex-col overflow-hidden lg:flex");
  });

  it("keeps scrolling inside Create panel and preserves sticky generation controls", () => {
    const panel = source("create-panel.tsx");
    expect(panel).toContain("flex h-full min-h-0 min-w-0 flex-col overflow-hidden");
    expect(panel).toContain("min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto");
    expect(panel).toContain("min-w-0 shrink-0 border-t");
    expect(panel).toContain('disabled={!s.canGenerate}');
    expect(panel).toContain("{s.blockers[0]}");
  });
});
