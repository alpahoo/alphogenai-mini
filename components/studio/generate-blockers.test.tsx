import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerateBlockers } from "./generate-blockers";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Generate blockers UI", () => {
  it("shows a single reason inline", () => {
    const t = text(renderToStaticMarkup(<GenerateBlockers blockers={[{ kind: "owner", message: "GPU authorization is off." }]} />));
    expect(t).toContain("Generation closed: GPU authorization is off.");
    expect(t).not.toContain("reasons");
  });

  it("surfaces a closed runtime before form problems and lists every reason", () => {
    const html = renderToStaticMarkup(<GenerateBlockers blockers={[
      { kind: "owner", code: "gate_disabled", message: "GPU authorization is off." },
      { kind: "owner", code: "expired", message: "The GPU authorization expired on 2026-11-09." },
      { kind: "form", message: "Prompt is required" },
    ]} />);
    const t = text(html);
    expect(t).toMatch(/^ ?Generation closed: GPU authorization is off\. · 3 reasons/);
    expect(t).toContain("Fix in the form");
    expect(t).toContain("Needs owner authorization");
    expect(t.indexOf("Fix in the form")).toBeLessThan(t.indexOf("Needs owner authorization"));
    expect(html).toContain('data-blocker-group="owner"');
  });

  it("renders nothing when Generate is allowed", () => {
    expect(renderToStaticMarkup(<GenerateBlockers blockers={[]} />)).toBe("");
  });

  it("is the only blocker display of the Generate bar, which keeps the server checks", () => {
    const panel = readFileSync(path.join(__dirname, "create-panel.tsx"), "utf8");
    expect(panel).toContain("disabled={!s.canGenerate}");
    expect(panel).toContain("<GenerateBlockers blockers={s.blockerList} />");
  });
});
