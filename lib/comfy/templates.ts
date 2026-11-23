import mossManifest from "@/workflows/comfy/templates/moss-image/manifest.json";
import mossT2i from "@/workflows/comfy/templates/moss-image/graph.t2i.api.json";
import { bindManifest, type BindManifest } from "./bind";
import { resolveTemplate, type Graph } from "./template";

/**
 * Admin template registry. Each entry names its runtime, its server binder and its admission path.
 * H3 keeps its original binder and SQL admission. New runtimes use the generic runtime gate.
 */
export type TemplateSlug = "minimax-h3" | "moss-image";

export interface ResolvedRun {
  graph: Graph; hash: string; params: Record<string, string | number>;
  referencePath: string | null; variant: string; runtime: string; template: string;
}

interface TemplateEntry {
  runtime: string;
  /** Server env flag that must be "true" before any admission for this template. */
  enabledEnv: string;
  admission: "h3_pilot" | "runtime_gate";
  resolve: (input: unknown, ownerId: string) => ResolvedRun;
}

const moss = { ...(mossManifest as unknown as BindManifest), latentNode: "6" };

export const TEMPLATES: Record<TemplateSlug, TemplateEntry> = {
  "minimax-h3": {
    runtime: "h3-video@1", enabledEnv: "COMFY_ADMIN_ENABLED", admission: "h3_pilot",
    resolve: (input, owner) => { const r = resolveTemplate(input, owner); return { ...r, template: "minimax-h3@1" }; },
  },
  "moss-image": {
    runtime: "moss-image@1", enabledEnv: "COMFY_MOSS_ENABLED", admission: "runtime_gate",
    resolve: input => ({ ...bindManifest(moss, { t2i: mossT2i as Graph }, input), referencePath: null }),
  },
};

export function templateFor(slug: unknown): TemplateSlug | null {
  if (slug === undefined) return "minimax-h3"; // backwards compatible with the pilot client
  return typeof slug === "string" && slug in TEMPLATES ? (slug as TemplateSlug) : null;
}

export function slugForTemplateVersion(version: string | null | undefined): TemplateSlug {
  return version?.startsWith("moss-image@") ? "moss-image" : "minimax-h3";
}
