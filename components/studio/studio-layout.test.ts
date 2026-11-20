import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(path.join(__dirname, name), "utf8");

describe("Studio narrow viewport layout regression", () => {
  it("constrains the main grid and its result column rather than widening the document", () => {
    const studio = source("studio.tsx");
    expect(studio).toContain("grid min-h-0 min-w-0 flex-1 overflow-clip");
    expect(studio).toContain("min-h-0 min-w-0 flex-col overflow-clip lg:flex");
  });

  it("clips instead of hiding: no ancestor of the Create column becomes a scroll container", () => {
    // overflow-hidden makes an element programmatically scrollable: scrollIntoView (new proposal, prompt)
    // could then scroll the Studio header out of view. overflow-clip cuts without scrolling.
    const studio = source("studio.tsx");
    const panel = source("create-panel.tsx");
    expect(studio).not.toMatch(/overflow-(x-)?hidden/);
    expect(panel).toContain("flex h-full min-h-0 min-w-0 flex-col overflow-clip");
  });

  it("keeps scrolling inside Create panel and preserves sticky generation controls", () => {
    const panel = source("create-panel.tsx");
    expect(panel).toContain("flex h-full min-h-0 min-w-0 flex-col overflow-clip");
    expect(panel).toContain("min-h-0 min-w-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto");
    expect(panel).toContain("min-w-0 shrink-0 border-t");
    expect(panel).toContain('disabled={!s.canGenerate}');
    expect(panel).toContain("<GenerateBlockers blockers={s.blockerList} />");
  });
});
