import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const remix = readFileSync("app/(workspace)/remix/page.tsx", "utf8");
const create = readFileSync("app/(workspace)/create/[mode]/page.tsx", "utf8");

describe("Parallax Remix entry points", () => {
  it("follows the theme instead of fixed light surfaces", () => {
    expect(remix).not.toMatch(/bg-\[#f5f3ee\]|bg-white\b|text-neutral-9\d\d|border-neutral-2\d\d/);
    expect(remix).toContain("bg-background");
    expect(remix).toContain("bg-card");
  });

  it("reads the private history only after the module is confirmed on", () => {
    const effect = remix.slice(remix.indexOf("useEffect("), remix.indexOf("}, []);"));
    expect(effect).toContain('fetch("/api/modules")');
    expect(effect).toMatch(/if \(on\) void loadSources\(\)/);
  });

  it("closes /create/remix when the module is off and tags the submission for the server gate", () => {
    expect(create).toMatch(/mode === "remix" && remixEnabled === false/);
    expect(create).toContain('"x-alphogen-module": "parallax_remix"');
  });
});
