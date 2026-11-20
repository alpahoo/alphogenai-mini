import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findModel } from "@/lib/studio/catalog";
import { defaultValues, type StudioManifest } from "@/lib/studio/manifest";
import { proposePatch } from "@/lib/studio/agent/patch";
import { historyEntry } from "@/lib/studio/agent/history";
import { AppliedNotice, AssistantHistory, ProposalCard, ProposalErrors } from "./assistant-proposal";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const moss = findModel("moss-image")!; const mm = moss.manifest as StudioManifest;
const ctx = { model: moss, manifest: mm, values: { ...defaultValues(mm), prompt: "A mug" }, hasReference: false };

describe("assistant proposal UI", () => {
  it("shows each change, the rationale, the workflow and states that nothing is generated", () => {
    const r = proposePatch(ctx, { steps: 30 }, { rationale: "More detail" });
    if (!r.ok) throw new Error("expected ok");
    const t = text(renderToStaticMarkup(<ProposalCard proposal={r.proposal} onAccept={() => {}} onReject={() => {}} />));
    expect(t).toContain("Proposed settings");
    expect(t).toContain("More detail");
    expect(t).toMatch(/Steps: 25 → 30/);
    expect(t).toContain("Workflow t2i");
    expect(t).toContain("nothing is generated");
    expect(t).toContain("Apply to settings");
    expect(t).not.toMatch(/\bGenerate\b/);
  });

  it("keeps long generated prompts within the narrow panel", () => {
    const longPrompt = "rainy cinematic Paris night ".repeat(35);
    const r = proposePatch(ctx, { prompt: longPrompt }, { rationale: "Detailed composition" });
    if (!r.ok) throw new Error("expected valid prompt patch");
    const html = renderToStaticMarkup(<ProposalCard proposal={r.proposal} onAccept={() => {}} onReject={() => {}} />);
    expect(html).toContain("max-w-full overflow-hidden");
    expect(html).toContain("break-words");
    expect(html).toContain("Apply to settings");
  });

  it("shows a long prompt in full in a readable scrollable block, the old one clamped", () => {
    const longPrompt = "Cinematic wide shot of Paris at night, rain on the cobblestones, neon reflections. ".repeat(12);
    const r = proposePatch(ctx, { prompt: longPrompt });
    if (!r.ok) throw new Error("expected valid prompt patch");
    const html = renderToStaticMarkup(<ProposalCard proposal={r.proposal} onAccept={() => {}} onReject={() => {}} />);
    expect(html).toContain("data-long-value");
    expect(html).toContain("max-h-48 overflow-y-auto whitespace-pre-wrap break-words");
    expect(html).toContain("line-clamp-2");
    expect(text(html)).toContain(longPrompt.trim());
  });

  it("never presents Apply as a generation authorization", () => {
    const r = proposePatch(ctx, { steps: 30 });
    if (!r.ok) throw new Error("expected ok");
    const t = text(renderToStaticMarkup(<ProposalCard proposal={r.proposal} onAccept={() => {}} onReject={() => {}} />));
    expect(t).toContain("no GPU run is authorized");
    expect(t).toContain("You can still edit every value afterwards");
    const notice = text(renderToStaticMarkup(<AppliedNotice onDismiss={() => {}} />));
    expect(notice).toContain("Settings updated from the proposal");
    expect(notice).toContain("still needs GPU authorization");
  });

  it("explains refusals", () => {
    const r = proposePatch(ctx, { unet_name: "x" });
    if (r.ok) throw new Error("expected refusal");
    expect(text(renderToStaticMarkup(<ProposalErrors errors={r.errors} />))).toContain("fixed by the validated workflow");
    expect(renderToStaticMarkup(<ProposalErrors errors={[]} />)).toBe("");
  });

  it("lists the local history", () => {
    const r = proposePatch(ctx, { steps: 30 }, { id: "a" });
    if (!r.ok) throw new Error("expected ok");
    const t = text(renderToStaticMarkup(<AssistantHistory entries={[historyEntry(r.proposal, "rejected")]} />));
    expect(t).toContain("Assistant history");
    expect(t).toContain("Rejected");
    expect(t).toMatch(/Steps: 25 → 30/);
  });
});

describe("assistant hook boundary", () => {
  it("has no access to generation, network or storage other than its local history", () => {
    // Code only: comments may explain that nothing is generated.
    const src = readFileSync(path.join(__dirname, "use-assistant.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/\bgenerate\b|fetch\(|\/api\/|dispatch|submissionParams/);
  });
});
