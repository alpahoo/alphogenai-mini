import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("components/studio/cinema-panel.tsx", "utf8");

describe("Cinema panel: own take selection keeps an unsaved draft usable", () => {
  it("advances the draft base version to the version returned by this tab's version-checked selection", () => {
    const select = panel.slice(panel.indexOf("const selectTake"), panel.indexOf("const prepare"));
    expect(select).toContain('action: "take.select"');
    expect(select).toMatch(/draftBaseVersions\.current\.get\(shot\.id\) === shot\.version\) draftBaseVersions\.current\.set\(shot\.id, next/);
    // The advance happens before the refresh, which keeps dirty drafts.
    expect(select.indexOf("draftBaseVersions.current.set")).toBeLessThan(select.indexOf("loadProject("));
  });
});
