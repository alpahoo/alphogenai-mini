import { createHash, randomInt } from "node:crypto";
import manifest from "@/workflows/comfy/templates/minimax-h3/manifest.json";
import t2v from "@/workflows/comfy/templates/minimax-h3/graph.t2v.api.json";
import i2v from "@/workflows/comfy/templates/minimax-h3/graph.i2v.api.json";
import full from "@/workflows/comfy/templates/minimax-h3/graph.t2v_full.api.json";

export { manifest };
export type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
export class InputError extends Error {}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const graphHash = (graph: Graph) => createHash("sha256").update(canonical(graph)).digest("hex");

/** Bind approved inputs to exported API graphs. ComfyUI retains graph validation/execution. */
export function resolveTemplate(input: unknown, ownerId: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid parameters");
  const source = input as Record<string, unknown>;
  const allowed = new Set([...manifest.params.map(p => p.key), "first_frame_path"]);
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new InputError(`Unknown or locked parameter: ${key}`);
  const params: Record<string, string | number> = {};
  for (const field of manifest.params) {
    const value = source[field.key] ?? ("default" in field ? field.default : undefined);
    if (value === undefined && field.key === "seed") { params.seed = randomInt(0, 2 ** 48 - 1); continue; }
    if (field.widget === "text") {
      if (typeof value !== "string" || value.trim().length < 3 || value.length > 2000) throw new InputError("Prompt must contain 3–2000 characters");
      params[field.key] = value.trim();
    } else if (field.widget === "select") {
      if (typeof value !== "string" || !(field.options as readonly string[]).includes(value)) throw new InputError(`Invalid ${field.key}`);
      params[field.key] = value;
    } else {
      const min = field.min as number, max = field.max as number, step = field.step as number;
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || Math.abs((value - min) / step - Math.round((value - min) / step)) > 0.00001) throw new InputError(`Invalid ${field.key}`);
      params[field.key] = value;
    }
  }
  let path: string | null = null;
  if (source.first_frame_path !== undefined) {
    if (typeof source.first_frame_path !== "string" || !source.first_frame_path.startsWith(`${ownerId}/`) || source.first_frame_path.includes("..") || !/^[a-zA-Z0-9_/-]+\.(png|jpg|webp)$/.test(source.first_frame_path)) throw new InputError("Invalid private reference");
    path = source.first_frame_path;
  }
  const key = `${path ? "present" : "absent"}|${params.quality}` as keyof typeof manifest.variants;
  const variant = manifest.variants[key];
  if (!variant) throw new InputError("Full quality with an image is not supported");
  const graph: Graph = structuredClone(({t2v, i2v, t2v_full:full})[variant as "t2v" | "i2v" | "t2v_full"]);
  for (const field of manifest.params) if (field.target) graph[field.target.node].inputs[field.target.input] = params[field.key];
  const [width, height] = manifest.resolutions[params.aspect as keyof typeof manifest.resolutions];
  const n = Math.max(5, Math.round(Number(params.seconds) * 24));
  Object.assign(graph["6"].inputs, {width, height, length:n + (5 - n % 17 + 17) % 17});
  // The reference name is assigned by this server, never a client path in ComfyUI.
  if (path) graph["20"].inputs.image = "first_frame.png";
  return {graph, hash:graphHash(graph), params, referencePath:path, variant, runtime:manifest.runtime};
}
