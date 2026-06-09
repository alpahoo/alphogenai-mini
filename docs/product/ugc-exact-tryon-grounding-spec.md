# UGC Exact Try-on And Product Grounding Spec

Date: 2026-06-09
Status: T-803a product/technical spec, no runtime change

## Goal

Define what AlphoGen must prove before it can promise stronger UGC behavior such as:

- exact clothing try-on,
- reliable product/logo preservation,
- product-in-hand grounding,
- creator identity consistency across longer UGC scenes.

This spec intentionally separates the current V1 UGC Studio from future T-803+
capabilities. Today, UGC is a premium Director workflow. T-803 is about validating
whether AlphoGen can become a more deterministic product demo / try-on studio.

## Current State

Current shipped UGC V1:

- accepts `product_reference` and `outfit_reference`,
- builds editable AI Director scenes,
- supports Creator identity choices,
- applies Social Pack presets,
- submits through `POST /api/jobs`,
- treats product/outfit references as model guidance.

Current V1 does **not** guarantee:

- exact garment transfer,
- exact product geometry,
- logo/text preservation,
- stable hand-object interaction,
- native lip-sync from imported voices for product UGC,
- 120s identity consistency on arbitrary model paths.

## Future Capability Tiers

### Tier 1: Grounded Product UGC

User promise:

> Keep the product visible and recognizable across the video.

Required behavior:

- product appears in the first scene,
- product is referenced in demo and CTA scenes,
- product silhouette/color stays broadly consistent,
- generated scenes avoid replacing the product with an unrelated object.

Allowed wording:

- "Product-grounded"
- "Designed to keep the product visible"
- "Best for product demos"

Avoid:

- "Exact logo preservation"
- "Pixel-accurate product"
- "Guaranteed product match"

### Tier 2: Logo / Text Preservation

User promise:

> Preserve readable brand marks or text where the selected model supports it.

Required behavior:

- explicit model capability validation,
- product crop or mask if needed,
- QA sample set with logos/text,
- fallback copy when text is likely to drift.

Allowed wording only after validation:

- "Logo-aware"
- "Text-sensitive"
- "Preserves simple marks when supported"

Avoid:

- "Perfect logo"
- "Exact packaging"

### Tier 3: Outfit Style Transfer

User promise:

> Use the outfit image as a wardrobe/style direction.

This is close to the current V1 behavior and does not require a new promise if copy
stays conservative.

Allowed wording:

- "Outfit/style reference"
- "Style match"
- "Wardrobe direction"

Avoid:

- "Try on this outfit"
- "Swap clothes"
- "Exact garment transfer"

### Tier 4: Exact Try-on

User promise:

> Apply the garment onto a consenting human identity with realistic fit.

This requires a new capability contract. It should not be marketed until validated.

Required behavior:

- explicit consent and identity handling,
- human segmentation or garment preprocessing,
- garment category detection,
- body/pose compatibility checks,
- provider/model validated for try-on or virtual fitting,
- failure modes surfaced before generation,
- tests with accepted and rejected cases.

Allowed wording only after validation:

- "Virtual try-on"
- "Garment fit preview"

Avoid before validation:

- "Exact try-on"
- "Swap clothes"
- "Perfect fit"

## Data And Payload Requirements

T-803 may need fields beyond the current UGC V1 payload:

```ts
type FutureUGCReferenceRole =
  | "product_reference"
  | "outfit_reference"
  | "garment_reference"
  | "logo_reference"
  | "human_identity_reference"
  | "pose_reference";
```

Potential future payload additions:

- `reference_intent`: `"product_grounding" | "style_direction" | "virtual_tryon"`;
- `product_mask_path`;
- `garment_mask_path`;
- `brand_mark_crop_path`;
- `consent_scope`;
- `grounding_strength`;
- `fallback_mode`.

Do not add these fields until an implementation slice needs them.

## UX Requirements

The UI must make capability level clear:

- Product reference: product grounding.
- Outfit/style reference: style direction.
- Virtual try-on: only if model and consent are validated.
- Readiness should show best-effort vs exact capability.

Potential UI surfaces:

- UGC readiness score expands into "Grounding readiness".
- Reference cards show role and capability.
- Director scenes can mark which scene must show the product.
- Post-generation QA can flag "product visible", "logo drift", "style drift".

No in-app educational paragraphs. Use short labels, status chips, and tooltips.

## Safety And Consent

Exact try-on touches identity/body manipulation. Any implementation must include:

- explicit user confirmation for real-person identity use,
- no raw face bypass around verified identity rules,
- no non-consensual clothing/body manipulation framing,
- clear best-effort language when exact garment transfer is not validated,
- rejection/fallback for sensitive or unsafe product/identity combinations.

## Evaluation Harness

Before marketing stronger claims, create a QA set:

- 10 simple products with distinct shapes,
- 10 products with logos/text,
- 10 clothing items across categories,
- 5 human identity references with consent,
- 5 no-human product-only cases,
- 5 negative cases that should stay best-effort or be rejected.

Metrics:

- product visible in first scene,
- product visible in demo scene,
- product category preserved,
- dominant colors preserved,
- logo/text readable where claimed,
- outfit category preserved,
- identity consistency,
- hand/object hallucination rate,
- scene-to-scene drift.

The first T-803 implementation should be evaluated manually and documented before
any stronger public UI wording ships.

## Architecture Decision

Do not create a dedicated UGC backend for this spec alone.

T-803 starts with:

1. capability matrix,
2. provider/model validation,
3. prompt/payload helpers,
4. QA harness,
5. UI readiness labels.

Only create a new backend path if a validated model requires preprocessing or payloads
that cannot be expressed through `POST /api/jobs`.

## Implementation Slices

### T-803a Spec

This document. Docs-only.

### T-803b Capability Matrix

Create a provider-neutral local helper describing model capabilities:

- product grounding,
- logo/text sensitivity,
- outfit style transfer,
- exact try-on,
- verified identity,
- max reliable duration.

No public provider names.

Delivered in `lib/ugc-capabilities.ts`. The matrix is intentionally conservative:
exact try-on is unavailable for all current models until a dedicated validation slice
proves otherwise.

### T-803c Grounding Readiness Helper

Extend UGC readiness to distinguish:

- Product visible,
- Product + identity,
- Product + outfit style,
- Try-on unavailable,
- Exact mode unavailable.

Delivered in `lib/ugc-readiness.ts` by combining the existing readiness checks with
`lib/ugc-capabilities.ts`. The UI can now surface product-grounded models and exact
try-on-unavailable states without changing the backend.

### T-803d QA Harness

Add a manual/test fixture document and optional scripted payload generation for a small
sample set. No real generation automation until costs and model choice are approved.

Delivered with `lib/ugc-qa-harness.ts`, `lib/__tests__/ugc-qa-harness.test.ts`, and
`docs/product/ugc-qa-harness.md`. The harness builds deterministic product-grounded,
style-direction, missing-product, identity, and avatar/presenter cases from pure
helpers without launching paid generations.

### T-803e Exact Try-on Decision

After validation, decide whether to:

- stay best-effort,
- add product grounding only,
- add logo-aware mode,
- build a true virtual try-on flow.

## Non-Goals

- No DB migration in T-803a.
- No provider integration in T-803a.
- No exact try-on promise in V1.
- No public provider names.
- No automatic e-commerce catalog ingestion.
- No claim verification.

## Acceptance Criteria

- Future agents know exactly what must be proven before stronger UGC wording ships.
- V1 UGC copy remains honest.
- Any future backend route has a concrete capability reason, not just naming convenience.
- Safety and consent are part of the capability contract from the start.
