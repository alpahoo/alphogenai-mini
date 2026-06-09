# UGC Generation Contract

Date: 2026-06-09
Status: Product/technical contract, no runtime change

## Goal

T-802 defines what AlphoGen means by "UGC generation" before any deeper backend or
model-specific implementation. The current product already has a strong UGC Studio
surface: product/outfit reference roles, creator identity, AI Director scenes, and
Social Pack presets. This contract prevents future work from duplicating that surface
or promising exact behaviors that the current generation pipeline cannot guarantee.

The user-facing promise for V1 is:

> Add a product, optional style reference, and creator identity; AlphoGen turns it into
> an editable, social-ready creator video plan.

The V1 promise is **not**:

> Guaranteed garment simulation, exact product grounding, or native lip-sync product
> demo across every model.

## Current Shipped Baseline

UGC is currently implemented as a premium planning layer over the existing Create +
AI Director pipeline:

- `product_reference` and `outfit_reference` image roles are accepted by the shared
  reference payload validator.
- `/create/product` and `/create/social` expose explicit Product reference and
  Outfit/style slots near the prompt composer.
- `lib/ugc-director.ts` builds a global prompt plus 5-6 editable Director scenes.
- Creator identity can be Product-first, Verified face, Saved Look, or Avatar.
- `lib/ugc-social-pack.ts` provides TikTok/Reels, Instagram feed, and Landscape ad
  presets.
- Building a UGC plan opens the existing AI Director and sets the Social Pack caption
  mode to `auto`.
- Generation still flows through the existing `POST /api/jobs` payload and the
  existing Director `scenes[]` path.

No separate UGC backend, database table, provider route, or state machine exists yet.

## V1 Contract

### Inputs

V1 accepts these structured inputs:

- Product reference image: required for a useful UGC plan.
- Outfit/style reference image: optional, used as a style direction.
- Product name: optional text label.
- Key benefit: optional claim or desired benefit.
- Tone: optional creator style.
- Angle: testimonial, unboxing, try-on, product demo, before/after, founder pitch.
- Platform preset: TikTok/Reels, Instagram feed, or Landscape ad.
- Creator identity: Product-first, Verified face, Saved Look, Avatar, or none.

### Payload Contract

The existing job payload remains the transport:

```ts
{
  prompt: string;
  scenes?: Array<{ prompt: string; duration_sec: number; engine?: string }>;
  references_payload?: {
    images?: Array<{
      role: "product_reference" | "outfit_reference" | "outfit_style" | "character_face";
      storage_path?: string;
      url?: string;
      filename?: string;
    }>;
  };
  byteplus_asset_ids?: string[];
  aspect_ratio?: "9:16" | "1:1" | "16:9";
  caption_mode?: "auto" | "none";
}
```

Rules:

- `product_reference` must mean "show and ground the product as much as the selected
  model supports".
- `outfit_reference` must mean "styling and outfit direction", not a guaranteed
  physically accurate try-on.
- `character_face` remains for verified face workflows only. Do not auto-classify
  raw product/outfit images as faces.
- Saved Look and Avatar identities are planning inputs until their dedicated
  generation contracts prove full reconstruction.
- Provider names remain confidential in public UI; labels should use product/model
  names only.

### Output Contract

V1 should produce:

- an editable Director scene plan,
- product-forward prompts,
- platform-aware aspect ratio and captions,
- Social Pack metadata hints,
- a normal AlphoGen job using existing generation infrastructure.

V1 may produce:

- good product visibility when the model follows references,
- outfit-inspired wardrobe or style,
- creator-like framing and script beats.

V1 must not claim:

- exact garment transfer,
- exact product geometry or logo preservation,
- guaranteed hands/product physics,
- native lip-sync from an imported avatar voice,
- guaranteed 120s identity consistency across arbitrary model paths.

## Product Copy Rules

Use precise copy in the UI:

- "Product reference"
- "Outfit/style reference"
- "Build UGC Director plan"
- "Creator identity"
- "Social Pack preset"
- "Style match"

Avoid misleading copy:

- "Swap clothes exactly"
- "Guaranteed try-on"
- "Native lip-sync with your voice"
- "Perfect product preservation"
- "Use any human face without verification"

## Model Routing Principles

The public UI should talk in model/capability terms, not provider terms.

Routing guidance:

- Product-only UGC: prefer a model that supports image references and product shots.
- Product + verified human face: prefer the verified-face path when the user needs
  a consistent human identity.
- Product + outfit: treat outfit as style direction; do not require exact try-on in V1.
- Avatar identity: use avatar/look routes only where the existing avatar contract
  supports reconstruction.
- Long-form UGC: prefer scene continuity and shorter editable beats rather than one
  long unconstrained prompt.

## Safety And Consent

- Raw real-person photos should go through verified face or avatar flows.
- If clothing appears on a real identifiable person, the product should avoid implying
  non-consensual body or clothing manipulation.
- Product claims should stay user-provided or generic; AlphoGen should not invent
  regulated claims.
- UGC scenes should keep social-native authenticity without fabricating testimonials
  from real people.

## Implementation Roadmap

### T-802a Contract

This document. Docs-only.

### T-802b UGC payload audit

Verify by code review and tests that `references_payload`, `byteplus_asset_ids`,
`aspect_ratio`, `caption_mode`, and Director `scenes[]` preserve the current UGC
inputs through `POST /api/jobs`.

No backend behavior change unless a concrete loss is found.

### T-802c UGC generation readiness score

Add a small helper that tells the UI whether the current UGC plan is:

- Ready,
- Missing product,
- Style-only,
- Needs verified identity,
- Best effort.

This should remain provider-neutral and testable.

### T-802d Dedicated UGC backend decision

Only after T-802b/c, decide whether a dedicated `/api/ugc/jobs` wrapper is needed.
Default answer should be "no" unless the normal jobs payload cannot preserve the
contract.

Decision complete: see `docs/product/ugc-backend-decision.md`. UGC V1 stays on
`POST /api/jobs`; no dedicated route is needed until a future exact try-on/product
grounding requirement proves the generic jobs contract insufficient.

### T-803 Future exact try-on / product grounding

Separate future work. Requires model/provider capability validation, UI copy changes,
and likely new tests. Do not blend this into the V1 UGC Studio polish.

## Non-Goals

- No new database migration in T-802.
- No new provider integration in T-802.
- No new job state machine.
- No e-commerce catalog ingestion.
- No guaranteed exact try-on.
- No native avatar lip-sync promise from imported voices.
- No public provider names in user-facing UI.

## Acceptance Criteria

- Future agents can tell exactly what UGC V1 guarantees.
- Existing T-801 UI/helper work remains the single UGC surface.
- Any future backend work has a clear payload contract to test against.
- Public wording stays honest, premium, and provider-neutral.
