# UGC Backend Decision

Date: 2026-06-09
Status: T-802d decision, no runtime change

## Decision

Do **not** create a dedicated `/api/ugc/jobs` route for UGC V1.

UGC V1 continues to use the existing `POST /api/jobs` contract.

## Why

T-802b proved that the current jobs payload already preserves the V1 UGC contract:

- `references_payload` with `product_reference` and `outfit_reference`,
- `byteplus_asset_ids` for verified creator identity,
- edited AI Director `scenes[]`,
- `aspect_ratio`,
- `caption_mode`,
- existing creator identity fields for avatar/look flows.

Adding `/api/ugc/jobs` now would duplicate validation, quota, plan gates, content
policy, references validation, storyboard mapping, provider routing, and job/scene
creation. That creates risk without adding a V1 capability.

## Current Architecture

The UGC Studio is a planning and orchestration layer:

1. UI collects product, style, creator identity, angle, platform, and tone.
2. `lib/ugc-director.ts` builds a global prompt and editable Director scenes.
3. `lib/ugc-readiness.ts` tells the user how ready the plan is.
4. The Create page submits through the same job builder as every other generation.
5. `POST /api/jobs` validates and persists the payload.
6. The existing job/scene state machine handles generation.

This keeps UGC inside the main AlphoGen pipeline instead of creating a parallel one.

## Non-Goals

- No dedicated UGC route in V1.
- No dedicated UGC database table.
- No separate UGC state machine.
- No bypass of quota, content policy, reference validation, or plan gating.
- No exact try-on/product-grounding promise in this decision.

## When To Reconsider

Create a dedicated UGC backend only if a future T-803+ requirement cannot be expressed
through the existing jobs contract.

Valid triggers:

- model-specific product grounding requires a different provider payload shape,
- exact try-on requires a new reference contract or preprocessing step,
- UGC needs asynchronous asset analysis before job creation,
- UGC requires a catalog/product facts table,
- native avatar/lip-sync UGC needs a different durable reconstruction contract,
- metrics prove the generic jobs route is causing repeated UGC-specific bugs.

Invalid triggers:

- wanting a cleaner route name,
- UI convenience,
- adding more prompt templates,
- changing Social Pack copy,
- adding more readiness labels,
- adding another creator identity selector.

## Required Guardrails If A Dedicated Route Is Added Later

Any future `/api/ugc/jobs` route must:

- call the same content policy layer,
- call the same reference validation layer,
- enforce the same user ownership checks,
- enforce the same quota and plan gates,
- forward to `POST /api/jobs` or share a tested payload builder,
- avoid provider names in public responses,
- include route-level tests equivalent to `app/api/jobs/route.test.ts`.

## Implementation Impact

No code change is required now.

The next product work should remain on UI/helper/spec layers unless T-803 exact
try-on/product grounding introduces a genuinely new backend contract.
