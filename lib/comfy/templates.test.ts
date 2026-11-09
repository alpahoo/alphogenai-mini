import { describe, expect, it } from "vitest";
import base from "@/workflows/comfy/templates/moss-image/graph.t2i.api.json";
import manifest from "@/workflows/comfy/templates/moss-image/manifest.json";
import { graphHash } from "./template";
import { slugForTemplateVersion, TEMPLATES, templateFor } from "./templates";

const owner = "8b3a3cd3-7c7b-4ba8-9ed5-c124f3176986";
const moss = TEMPLATES["moss-image"];

describe("MOSS-Image template binding", () => {
  it("writes only declared inputs and keeps loaders/model files untouched", () => {
    const r = moss.resolve({ prompt: "A red bicycle in a garden", seed: 7, aspect: "16:9" }, owner);
    expect(r.runtime).toBe("moss-image@1");
    expect(r.template).toBe("moss-image@1");
    expect(r.referencePath).toBeNull();
    expect(r.graph["4"].inputs.text).toBe("A red bicycle in a garden");
    expect(r.graph["7"].inputs).toMatchObject({ seed: 7, steps: 25, cfg: 2.5, sampler_name: "er_sde", scheduler: "simple", denoise: 1 });
    expect(r.graph["6"].inputs).toEqual({ width: 1344, height: 768, batch_size: 1 });
    for (const id of ["1", "2", "3", "8", "9"]) expect(r.graph[id]).toEqual((base as Record<string, unknown>)[id]);
    expect(r.hash).toBe(graphHash(r.graph));
  });

  it("uses the official template defaults and a random seed when none is given", () => {
    const r = moss.resolve({ prompt: "A lighthouse at dawn" }, owner);
    expect(r.params.negative_prompt).toBe("nsfw, worst quality, bad anatomy, watermark, jpeg artifact");
    expect(r.graph["6"].inputs).toMatchObject({ width: 1024, height: 1024 });
    expect(typeof r.params.seed).toBe("number");
  });

  it("allows an empty negative prompt", () => {
    expect(moss.resolve({ prompt: "A lighthouse", negative_prompt: "" }, owner).graph["5"].inputs.text).toBe("");
  });

  it("every resolution is a multiple of 16 and about one megapixel", () => {
    for (const [w, h] of Object.values(manifest.resolutions)) {
      expect(w % 16).toBe(0); expect(h % 16).toBe(0);
      expect(w * h).toBeGreaterThan(0.95e6); expect(w * h).toBeLessThan(1.1e6);
    }
  });

  it.each([{}, null, [], { prompt: "ab" }, { prompt: "ok prompt", steps: 9 }, { prompt: "ok prompt", steps: 51 },
    { prompt: "ok prompt", cfg: 0.5 }, { prompt: "ok prompt", cfg: 2.55 }, { prompt: "ok prompt", sampler_name: "uni_pc" },
    { prompt: "ok prompt", scheduler: "ddim_uniform" }, { prompt: "ok prompt", aspect: "21:9" }, { prompt: "ok prompt", unet_name: "x" },
    { prompt: "ok prompt", denoise: 0.5 }, { prompt: "ok prompt", first_frame_path: `${owner}/a.png` },
    { prompt: "ok prompt", negative_prompt: "x".repeat(1001) }, { prompt: "ok prompt", seed: -1 }])(
    "rejects unsafe or undeclared input %#", bad => expect(() => moss.resolve(bad, owner)).toThrow());

  it("routes template slugs and keeps the pilot default", () => {
    expect(templateFor(undefined)).toBe("minimax-h3");
    expect(templateFor("moss-image")).toBe("moss-image");
    expect(templateFor("../etc")).toBeNull();
    expect(templateFor(42)).toBeNull();
    expect(slugForTemplateVersion("moss-image@1")).toBe("moss-image");
    expect(slugForTemplateVersion("minimax-h3@1")).toBe("minimax-h3");
    expect(TEMPLATES["minimax-h3"].admission).toBe("h3_pilot");
    expect(moss.admission).toBe("runtime_gate");
    expect(moss.enabledEnv).toBe("COMFY_MOSS_ENABLED");
  });
});
