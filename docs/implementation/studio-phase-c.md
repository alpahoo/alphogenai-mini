# Studio phase C: no-node Studio + AI assistant

ComfyUI stays an invisible engine. Users drive workflows through the existing Studio, or later through an
assistant that proposes parameter changes. No node editor and no user-facing JSON. Admin only.

## Audit (C1, 2026-11-10)
The existing Studio already builds everything from the manifests (`workflows/comfy/templates/*/manifest.json`):
- model picker (`lib/studio/catalog.ts`), format and resolution (`aspect-picker.tsx`, `manifest.resolutions`);
- simple and advanced controls (`param-control.tsx`, `advanced-panel.tsx`, `presets.ts`);
- variant resolution that blocks unvalidated combinations (`resolveVariant`), and references only where the
  manifest allows them (`reference-drop.tsx`);
- history, reuse and compare.

| Gap | Change in C1a |
|---|---|
| Hard-coded cost text in the catalog: "Reserves $0.20" and "Estimated … on L40S", wrong since the H100 run | Removed. The server returns `cost` with the GET readiness call. |
| The web app has no way to know the Modal GPU | Server env `COMFY_MOSS_EXECUTOR_GPU` (`L40S` or `H100`, strict). Unset → "Not confirmed", no estimate. |
| No review before submission | "Review before generating": workflow, output, every submitted value, changes from defaults, fixed values. |
| Studio and server text validation differed | Max length checked on the raw text, like the binders. A prompt padded with spaces past the limit passed in the Studio and was refused by the server. |
| Validation tests | Parity test for every H3 and MOSS parameter: the Studio and the server binder accept and refuse the same values. |

## Cost panel: three separate facts
1. **Reservation:** the application provision per run. For MOSS it is read from `comfy_runtime_gates.reserve_usd`; for H3 it mirrors the SQL value of 0.75.
   It is not an invoice and not a Modal billing limit.
2. **GPU:**
   - MOSS: from `COMFY_MOSS_EXECUTOR_GPU`. This is a **manual mirror** of Modal's `MOSS_EXECUTOR_GPU`. If Modal is redeployed on another GPU, this variable must be updated too.
   - H3: H100, fixed in the `execute_graph` code.
3. **Estimate:** labelled measured or estimated, with its basis (`lib/comfy/executor-info.ts`).
   MOSS H100 ≈ $0.06, measured on 1 run. MOSS L40S $0.03–0.10 and H3 $0.15–0.30 are estimates.

Activation: set `COMFY_MOSS_EXECUTOR_GPU=H100` in the Vercel server env. It is not public (no `NEXT_PUBLIC_` prefix) and needs owner approval.
Until it is set, the Studio shows "GPU: Not confirmed".

A durable guarantee, later: record the executed GPU on each run (additive migration). Not part of C1a.

## C2 architecture: assistant
The agent's only output is a **parameter patch**, never a graph or a run.

```
user message ─► C2b LLM route (admin, server) ─► tool calls ─► C2a engine (pure, tested) ─► patch
                                                                          │
                                       validateValues + resolveVariant (same as the Studio)
                                                                          ▼
                                    "Review before generating" (C1a) ─► user clicks Generate
```

**C2a engine, no LLM (implemented, `lib/studio/agent/`):**
- **Tools derived from each manifest:**
  - `get_config`: current values, variant and constraints;
  - `describe_param`: label, help, bounds, options;
  - `propose_patch({key: value})`.

  No tool can write to a graph, read files or secrets, or start a run.
- **Strict patch validation:** only declared keys, typed values, the manifest bounds and options, and a combination with a validated
  workflow. The prompt is treated as data. Locked or derived keys are refused.
- **Preview:** the patch is applied to a draft and shown through `generationPreview` (changes in the C1a card). The user accepts or rejects it.
  Accepting only fills the form; generation stays the existing Generate button.
- **History:** a local list of proposed, accepted and rejected patches, kept in the browser for the prototype. No migration.

**C2b, the conversational agent (after budget approval):**
- Admin route with an economical LLM; Qwen3 is the candidate under evaluation. Nothing is activated before price, budget and data residency are approved: user prompts would be sent to the provider.
- Server-side tool loop limited to the C2a tools, with token and call limits. The model sees manifests, never graphs.

## C2a: what is implemented
- `lib/studio/agent/patch.ts`:
  - `proposePatch` refuses, in order:
    - a non-object or empty patch, or one with too many keys;
    - unknown keys (including `__proto__` and graph-like keys);
    - locked graph inputs (`manifest.locked`) and the private reference;
    - wrong types (no string-to-number coercion);
    - values outside the manifest bounds, steps or options;
    - combinations without a workflow, and no-op patches.

    `null` only clears a parameter that has no default (seed → random). One forbidden key rejects the whole patch.
  - `acceptProposal` re-validates against the *current* form. It refuses `stale` (form or reference changed), `wrong_template` and `invalid` (tampered
    proposal). It returns form values only.
- `lib/studio/agent/tools.ts`: `get_config`, `describe_param` and `propose_patch`, with JSON schemas derived from the
  manifest (closed objects). `runTool` refuses unknown tools and unexpected inputs. There is no generate, submit, dispatch, file or
  graph tool.
- `lib/studio/agent/history.ts`: accepted and rejected proposals, newest first, at most 20, per template, in `localStorage`
  only. Values are truncated to 200 characters, and malformed or foreign entries are dropped on load.
- UI in the existing panel (`assistant-proposal.tsx`, `use-assistant.ts`):
  - proposal card (changes, rationale, workflow) with "Apply to settings" and "Reject";
  - list of refusal reasons;
  - collapsible history.

  Nothing in the UI creates proposals yet. The C2b chat will call `runTool`, which feeds `assistant.propose`.
