import { randomInt } from "node:crypto";
import { graphHash, InputError, type Graph } from "./template";

/**
 * Generic binder for manifest-declared inputs. Writes only into `target` node inputs declared by the
 * manifest, rejects unknown keys and out-of-range values. ComfyUI keeps semantic validation of the graph.
 * The H3 template keeps its own audited binder (`resolveTemplate`).
 */
export interface BindParam {
  key: string; widget: string; required?: boolean; maxLength?: number;
  default?: string | number; min?: number; max?: number; step?: number;
  options?: readonly string[]; target?: { node: string; input: string };
}
export interface BindManifest {
  slug: string; runtime: string; version: number;
  variants: Record<string, string | null>;
  params: readonly BindParam[];
  resolutions?: Record<string, readonly number[]>;
  /** Node receiving width/height from `aspect`. */
  latentNode?: string;
}

export function bindManifest(manifest: BindManifest, graphs: Record<string, Graph>, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError("Invalid parameters");
  const source = input as Record<string, unknown>;
  const allowed = new Set(manifest.params.map(p => p.key));
  for (const key of Object.keys(source)) if (!allowed.has(key)) throw new InputError(`Unknown or locked parameter: ${key}`);
  const params: Record<string, string | number> = {};
  for (const field of manifest.params) {
    const value = source[field.key] ?? field.default;
    if (value === undefined && field.key === "seed") { params.seed = randomInt(0, 2 ** 48 - 1); continue; }
    if (field.widget === "text") {
      const max = field.maxLength ?? 2000;
      const min = field.required === false ? 0 : 3;
      if (typeof value !== "string" || value.trim().length < min || value.length > max) throw new InputError(`${field.key} must contain ${min}–${max} characters`);
      params[field.key] = value.trim();
    } else if (field.widget === "select") {
      if (typeof value !== "string" || !field.options?.includes(value)) throw new InputError(`Invalid ${field.key}`);
      params[field.key] = value;
    } else if (field.widget === "number") {
      const min = field.min ?? 0, max = field.max ?? Number.MAX_SAFE_INTEGER, step = field.step ?? 1;
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max ||
        Math.abs((value - min) / step - Math.round((value - min) / step)) > 0.00001) throw new InputError(`Invalid ${field.key}`);
      params[field.key] = value;
    } else throw new InputError(`Unsupported widget for ${field.key}`);
  }
  const variantNames = Object.values(manifest.variants).filter((v): v is string => !!v);
  if (variantNames.length !== 1) throw new InputError("Template variant selection is not configured");
  const variant = variantNames[0];
  const base = graphs[variant];
  if (!base) throw new InputError("Template graph missing");
  const graph: Graph = structuredClone(base);
  for (const field of manifest.params) {
    if (!field.target) continue;
    const node = graph[field.target.node];
    if (!node || !(field.target.input in node.inputs)) throw new InputError("Manifest target does not exist in the graph");
    node.inputs[field.target.input] = params[field.key];
  }
  if (manifest.resolutions && manifest.latentNode) {
    const size = manifest.resolutions[String(params.aspect)];
    if (!size) throw new InputError("Invalid aspect");
    Object.assign(graph[manifest.latentNode].inputs, { width: size[0], height: size[1] });
  }
  return { graph, hash: graphHash(graph), params, variant, runtime: manifest.runtime, template: `${manifest.slug}@${manifest.version}` };
}
