import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { findModel } from "@/lib/studio/catalog";
import { defaultValues, type StudioManifest } from "@/lib/studio/manifest";
import { generationPreview } from "@/lib/studio/preview";
import { CostSummary, GenerationPreviewCard } from "./generation-preview";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Studio cost summary", () => {
  it("shows reservation, configured GPU and measured cost as three separate facts", () => {
    const t = text(renderToStaticMarkup(<CostSummary loaded cost={{ reservation_usd: 0.45, gpu: "H100", gpu_source: "server_config",
      estimate: { low_usd: 0.06, high_usd: 0.06, measured: true, basis: "Measured on 1 run." } }} />));
    expect(t).toContain("Reservation $0.45 / run");
    expect(t).toContain("GPU H100");
    expect(t).toContain("Measured ≈ $0.06");
  });
  it("never shows a guessed GPU or estimate", () => {
    const t = text(renderToStaticMarkup(<CostSummary loaded cost={{ reservation_usd: 0.45, gpu: null, gpu_source: null, estimate: null }} />));
    expect(t).toContain("GPU Not confirmed");
    expect(t).toContain("Estimate —");
    expect(t).not.toMatch(/L40S|H100/);
  });
});

describe("Review before generating", () => {
  it("lists workflow, output and changes from defaults", () => {
    const moss = findModel("moss-image")!; const m = moss.manifest as StudioManifest;
    const p = generationPreview(moss, m, { ...defaultValues(m), prompt: "A mug", steps: 30 }, null);
    const t = text(renderToStaticMarkup(<GenerationPreviewCard preview={p} />));
    expect(t).toContain("1 change from defaults");
    expect(t).toContain("Workflow t2i");
    expect(t).toContain("1024 × 1024 px");
    expect(t).toMatch(/25 → 30/);
  });
});
