/**
 * C2a: the assistant's tools, derived from the template manifest. Exactly three, all read-only or
 * proposal-only. There is deliberately NO tool to generate, submit, dispatch, read files, read secrets
 * or touch a graph: the C2b LLM can only call these, and generation remains the user's Generate click.
 */
import { generationPreview } from "../preview";
import type { ManifestParam } from "../manifest";
import { proposePatch, templateId, type PatchError, type Proposal, type StudioContext } from "./patch";

export type ToolName = "get_config" | "describe_param" | "propose_patch";
export const TOOL_NAMES: readonly ToolName[] = ["get_config", "describe_param", "propose_patch"];

type JsonSchema = Record<string, unknown>;
export interface ToolDefinition { name: ToolName; description: string; input_schema: JsonSchema }

/** JSON schema of one patchable parameter, from the manifest only. */
function paramSchema(p: ManifestParam): JsonSchema {
  const base: JsonSchema = { description: [p.label, p.help].filter(Boolean).join(". ") };
  if (p.widget === "number") {
    return {
      ...base,
      type: p.default === undefined ? ["number", "null"] : "number",
      ...(p.min !== undefined ? { minimum: p.min } : {}),
      ...(p.max !== undefined ? { maximum: p.max } : {}),
      ...(p.step !== undefined ? { "x-step": p.step } : {}),
    };
  }
  if (p.widget === "select") return { ...base, type: "string", enum: [...(p.options ?? [])] };
  return { ...base, type: "string", maxLength: p.maxLength ?? 2000 };
}

export function toolDefinitions(ctx: Pick<StudioContext, "manifest">): ToolDefinition[] {
  const { manifest } = ctx;
  const properties = Object.fromEntries(manifest.params.map(p => [p.key, paramSchema(p)]));
  return [
    {
      name: "get_config",
      description: `Current ${manifest.title} settings, resolved workflow and output. Read-only.`,
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "describe_param",
      description: "Rules of one parameter: label, help, type, bounds, options, default. Read-only.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["key"],
        properties: { key: { type: "string", enum: manifest.params.map(p => p.key) } },
      },
    },
    {
      name: "propose_patch",
      description: "Propose parameter changes. The user reviews and accepts or rejects them. Nothing is generated.",
      input_schema: {
        type: "object", additionalProperties: false, required: ["changes"],
        properties: {
          changes: { type: "object", additionalProperties: false, minProperties: 1, properties },
          rationale: { type: "string", maxLength: 500 },
        },
      },
    },
  ];
}

export type ToolResult =
  | { ok: true; tool: "get_config"; config: ReturnType<typeof getConfig> }
  | { ok: true; tool: "describe_param"; param: ReturnType<typeof describeParam> }
  | { ok: true; tool: "propose_patch"; proposal: Proposal }
  | { ok: false; tool: string; errors: PatchError[] | { code: string; message: string }[] };

function getConfig(ctx: StudioContext) {
  const preview = generationPreview(ctx.model, ctx.manifest, ctx.values, ctx.hasReference ? { name: ctx.referenceName ?? "reference" } : null);
  return {
    template: templateId(ctx.manifest),
    title: ctx.manifest.title,
    kind: ctx.model.kind,
    workflow: preview.variant,
    output: preview.output,
    reference_attached: ctx.hasReference,
    settings: preview.rows.map(r => ({ key: r.key, label: r.label, value: r.value, is_default: !r.changed, ...(r.error ? { error: r.error } : {}) })),
    fixed_by_workflow: preview.locked,
  };
}

function describeParam(p: ManifestParam) {
  return {
    key: p.key, label: p.label, help: p.help ?? null, type: p.widget,
    default: p.default ?? null, min: p.min ?? null, max: p.max ?? null, step: p.step ?? null,
    options: p.options ? [...p.options] : null, option_labels: p.optionLabels ?? null,
    max_length: p.widget === "text" ? (p.maxLength ?? 2000) : null,
    required: p.widget === "text" ? p.required !== false : null,
  };
}

/** Run one tool call. Unknown tools and malformed inputs are refused, never guessed. */
export function runTool(ctx: StudioContext, name: unknown, input: unknown): ToolResult {
  if (typeof name !== "string" || !(TOOL_NAMES as readonly string[]).includes(name)) {
    return { ok: false, tool: String(name), errors: [{ code: "unknown_tool", message: "This tool does not exist" }] };
  }
  const args = (typeof input === "object" && input !== null && !Array.isArray(input) ? input : null) as Record<string, unknown> | null;
  if (!args) return { ok: false, tool: name, errors: [{ code: "bad_input", message: "Tool input must be an object" }] };

  if (name === "get_config") {
    if (Object.keys(args).length) return { ok: false, tool: name, errors: [{ code: "bad_input", message: "get_config takes no input" }] };
    return { ok: true, tool: name, config: getConfig(ctx) };
  }
  if (name === "describe_param") {
    const extra = Object.keys(args).filter(k => k !== "key");
    const p = ctx.manifest.params.find(x => x.key === args.key);
    if (extra.length || !p) return { ok: false, tool: name, errors: [{ code: "unknown_param", message: "Unknown parameter" }] };
    return { ok: true, tool: name, param: describeParam(p) };
  }
  const extra = Object.keys(args).filter(k => k !== "changes" && k !== "rationale");
  if (extra.length) return { ok: false, tool: name, errors: [{ code: "bad_input", message: `Unexpected input: ${extra.join(", ")}` }] };
  if (args.rationale !== undefined && typeof args.rationale !== "string") {
    return { ok: false, tool: name, errors: [{ code: "bad_input", message: "rationale must be text" }] };
  }
  const result = proposePatch(ctx, args.changes, { rationale: (args.rationale as string | undefined) ?? null });
  return result.ok ? { ok: true, tool: "propose_patch", proposal: result.proposal } : { ok: false, tool: name, errors: result.errors };
}
