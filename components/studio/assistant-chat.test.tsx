import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findModel } from "@/lib/studio/catalog";
import { defaultValues, type StudioManifest } from "@/lib/studio/manifest";
import { AssistantChat } from "./assistant-chat";
import type { StudioState } from "./use-studio";

const read = (f: string) => readFileSync(path.join(__dirname, f), "utf8");
const moss = findModel("moss-image")!;
const stub = {
  model: moss, values: { ...defaultValues(moss.manifest as StudioManifest), prompt: "A mug" }, reference: null,
  assistant: { propose: () => null },
} as unknown as StudioState;

describe("Studio assistant chat (C2b)", () => {
  it("renders inside the Create panel as a collapsed section", () => {
    const html = renderToStaticMarkup(<AssistantChat s={stub} />);
    expect(html).toContain("Studio assistant");
    expect(html).toContain("Assistant");
    expect(html).toContain('aria-expanded="false"');
    expect(read("create-panel.tsx")).toMatch(/<AssistantChat s=\{s\} \/>/);
  });

  it("has no path to generation: no Generate call, no runs API, proposals go through C2a", () => {
    for (const f of ["assistant-chat.tsx", "use-assistant-chat.ts", "../../lib/studio/agent/chat-session.ts"]) {
      const src = read(f);
      expect(src).not.toMatch(/\bs\.generate\b|\bgenerate\(/);
      expect(src).not.toContain("/api/admin/comfy/runs");
      expect(src).not.toMatch(/dispatch|graph/i);
    }
    const hook = read("use-assistant-chat.ts");
    expect(hook).toMatch(/propose: s\.assistant\.propose/);
    expect(hook).toContain("/api/admin/studio/assistant");
    expect(read("../../lib/studio/agent/chat-session.ts")).toContain("now.propose(answer.proposal.patch, answer.proposal.rationale)");
  });

  it("keeps the conversation in memory only (no storage)", () => {
    for (const f of ["use-assistant-chat.ts", "../../lib/studio/agent/chat-session.ts"]) {
      expect(read(f)).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    }
  });
});
