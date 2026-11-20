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

## C2b: conversational assistant (draft, no provider connected)

The administrator chats with the assistant in an **Assistant** section of the existing Create panel. The assistant explains
settings and proposes changes; proposals appear in the existing C2a card ("Apply to settings" / "Reject"). Only the
administrator's Generate button starts a generation. No node editor, no graph, no JSON shown to the user.

**At the time of the C2b base PR no language model was connected.** The later Groq adapter is registered, but the route still answers
503 until the owner explicitly enables the provider and configures its dedicated server-side key. No key has been added here.

### What is implemented
- `app/api/admin/studio/assistant/route.ts`:
  - `requireAdmin` on GET (readiness, limits; no provider name, key or price) and POST.
  - POST validates the request, rate-limits, runs the tool loop, and logs counters only: no prompt, reply or values.
  - It writes nothing to the database and calls no generation API.
- `lib/studio/agent/conversation.ts`, the request contract:
  - Fields: template slug, current form values, `has_reference` / `reference_id`, and text turns.
  - The server rebuilds the context from the manifest. Only declared keys survive, and the reference parameter is dropped.
  - The private reference path and file name are never sent to the model; it only sees `reference_attached`.
  - Turns must alternate and start and end with the user. Roles other than user/assistant and extra fields are refused.
  - The system prompt states the assistant's limits. Text inside settings (the prompt) is data, never instructions.
- `lib/studio/agent/loop.ts`, the server-side tool loop:
  - The model can only call the three C2a tools, executed by `runTool` against the server context. Any other tool name is answered with `unknown_tool` and never executed.
  - A valid `propose_patch` is returned to the browser, which re-validates it with `proposePatch` against the current form before showing the card. Refusals go back to the model so it can correct itself.
  - Stop causes: answered, tool_rounds, budget, input_too_large, max_tokens, refusal, timeout, provider_error. Fallback messages never include provider error text.
- `lib/studio/agent/provider.ts`: provider-neutral interface. The assistant is enabled only if `STUDIO_ASSISTANT_ENABLED=true`, an approved adapter is named by `STUDIO_ASSISTANT_PROVIDER`, and that adapter declares prices.
- UI:
  - `components/studio/assistant-chat.tsx` and `use-assistant-chat.ts`: collapsed section, conversation in memory only, "New conversation" button, reset on model switch.
  - No Generate call and no runs API.

### Limits (`lib/studio/agent/limits.ts`, enforced on the server)
| Limit | Value |
|---|---|
| Messages per conversation / characters per message / total characters | 20 / 2,000 / 16,000 |
| Request body | 64 KB |
| Model calls per user message | 1 + 4 tool rounds |
| Tool calls per model response | 4 (extra calls answered with an error) |
| Output tokens per call | 700 |
| Estimated input tokens per call | 12,000 (checked before calling) |
| Cost per user message | $0.02 worst case, checked **before** each call from the adapter's prices |
| Per admin | 20 requests/hour and $0.50/day, in memory per server instance (best effort) |
| Whole loop timeout | 45 s |

The in-memory daily cap does not survive restarts or span instances. The **durable** cap must be the provider's own spending
limit on a dedicated key or workspace, set before activation. A persisted ledger would need a migration; it is out of scope.

### Tests (no LLM, no network)
- A scripted fake provider (`fake-provider.ts`) covers:
  - answer, read-then-propose, and refused patches fed back to the model;
  - unknown tools (generate, graph, files), the round and per-turn call limits;
  - the cost cap before the first call and mid-conversation, and the daily allowance;
  - oversized input, refusal, max_tokens, provider errors without leaks, timeout;
  - the reference path never sent to the model.
- Request validation, the provider gate (off by default, empty adapter list, refused without prices), the rate limiter and the browser helpers.
- Route: admin required, 503 while no provider, validation before any call, reply + patch + usage, logs without content, 429.
- UI: section rendered in the Create panel, no generation path, conversation not stored.

### Historical LLM comparison (superseded by Groq/Qwen selection on 2026-11-20)
Typical answer: 2 model calls, about 3,000 input and 300 output tokens each.

| Option | Price per million tokens (input / output) | Typical answer | Data |
|---|---|---|---|
| **Claude Haiku 5.5** (Anthropic API), recommended | $0.10 / $0.50 (prompts up to 100k tokens) | ≈ $0.001 | API data not used for training by default. Deleted within 30 days (zero retention by agreement). First-party routing is global or US only (×1.1 for US). EU-regional only through Bedrock or Google Cloud (+10%). |
| Mistral Small 4 (La Plateforme), EU alternative | $0.15 / $0.60 | ≈ $0.0013 | Hosted in the EU by default. The commercial terms exclude training on customer data, except opt-in features, feedback and Labs/Preview models. |
| Qwen Flash (Alibaba Model Studio, international) | Not verified on an official page (aggregators: about $0.05 / $0.40) | Not verified | International endpoint in Singapore. Not recommended until prices and data terms are confirmed. |

Historical recommendation (superseded; see Groq adapter below):
- Use **Claude Haiku 5.5** for tool-use reliability at the lowest verified price. The adapter must use the official SDK (`@anthropic-ai/sdk`), with low effort and `strict` tools.
- Choose **Mistral Small 4** instead if EU data residency is required.
- The prompt typed in the Studio (generation text) is sent to the provider as part of `get_config`. The reference image and its path are never sent.

Proposed test budget, separate from the GPU budget: **$2**, about 2,000 answers. It should be enforced by a spending limit on a dedicated provider key or workspace.

### Activation checklist (owner approval at each step)
1. Choose the provider and confirm its data terms for ASTUCA OÜ.
2. Create a dedicated key with its own spending limit. Never reuse a production key.
3. Review and merge the adapter PR. It adds the SDK dependency and one `ADAPTERS` entry with the verified prices.
4. Set the server-only env vars in Vercel (`STUDIO_ASSISTANT_ENABLED`, `STUDIO_ASSISTANT_PROVIDER`, the key) and redeploy.
5. Run a short manual test from the Studio, then read the logged counters and the provider's usage page.


## C2b Groq/Qwen adapter — candidate, owner approval required before activation (2026-11-20)

A single Groq adapter is registered in `lib/studio/agent/provider.ts`. It calls the official Groq **OpenAI-compatible REST Chat Completions API** using server-side `fetch`, rather than adding a JavaScript SDK dependency. This keeps package-lock unchanged. Review this implementation independently; the model cannot call anything beyond the existing three C2a tools.

- **Fixed model:** `qwen/qwen3.8-27b` (Preview; may be withdrawn at short notice).
- **Official quoted paid API tariff (check again before enabling):** USD $0.80 per million input tokens / $4.00 per million output tokens. These tariffs are used conservatively for local pre-call cost estimates even on a free plan.
- **Owner-confirmed organization AND Default Project quotas:** 30 RPM, 1,000 RPD, 8,000 TPM, 200,000 TPD. These are rate limits, **not a billing guarantee**. Multiple tool rounds per question consume multiple API calls and tokens.
- **Tool protocol:** `reasoning_format: "hidden"`, `reasoning_effort: "none"`, `parallel_tool_calls: false`, `stream: false`. No `json_schema` structured response mode while using tools. Every patch still passes the C2a strict allowlist.
- **Data handling:** the current generation prompt and chat messages go to Groq in the US when enabled. Reference image paths and file names stay out of provider messages; do not enable for personal/sensitive prompts without reviewing Groq's terms. Groq Data Controls has an optional Zero Data Retention setting; verify account policy independently.
- **Unavailability:** Groq errors/429 are not retried here (avoid accidental loops/costs), no error bodies or keys are surfaced to browsers/logs. The Studio will show a generic provider error via the existing route. A disabled/missing key returns 503 before any external API call.
- **Activation remains forbidden in this PR:** do not place a live key or enable a provider before explicit approval. The application-level rate limiter is **per Vercel instance** and not a durable charge cap. Check the Groq account's plan, billing status, whether a strict provider-side charge limit exists, and the relevant privacy terms.

### Required Vercel server secrets when owner approves the test

```text
GROQ_API_KEY=<dedicated secret configured in Vercel, never commit or paste into chat>
STUDIO_ASSISTANT_PROVIDER=groq
STUDIO_ASSISTANT_ENABLED=true   # set only after owner explicitly authorizes an external test
```

Leave `STUDIO_ASSISTANT_ENABLED` **unset/false** for now. Never add a `NEXT_PUBLIC_` prefix. Do not reuse any production key.

Official references: https://console.groq.com/docs/models ; https://console.groq.com/docs/tool-use/overview ; https://console.groq.com/docs/reasoning ; https://console.groq.com/docs/rate-limits
