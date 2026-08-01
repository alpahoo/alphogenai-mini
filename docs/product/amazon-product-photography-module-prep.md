# Amazon / Product Photography Module Preparation

Status: implementation-ready product preparation  
Last reviewed: 2026-08-01  
Runtime spend authorized: no

## 1. User outcome

The user supplies a product URL and/or one or more product photos, confirms extracted
facts, selects a commercial objective, and receives a coherent marketplace-ready image
pack. The first release is not another Product Ad generator.

Primary outcome:

> Turn existing product material into a consistent four-image commerce pack that can
> be reviewed, regenerated per image, and downloaded together.

## 2. First vertical slice

### Inputs

- Product URL or uploaded product images.
- Product name and category.
- Three to five verified features.
- Target buyer.
- Optional visual preset.
- Marketplace preset: Amazon first.

### Outputs

1. **Hero**: square, product centered, pure white background, no text or props.
2. **Lifestyle**: product in a plausible use context for the target buyer.
3. **Feature card**: product plus deterministic AlphoGen typography and verified
   feature callouts.
4. **Detail**: macro/material/detail image, with category-specific focus.

The feature card must not ask an image model to spell marketing text. AlphoGen renders
the labels deterministically after the product visual is approved.

## 3. Existing AlphoGen capabilities to reuse

| Existing capability | Reuse |
|---|---|
| URL/product ingestion | Source product name, imagery and candidate facts |
| Product media normalization | Stable references for generation |
| Provider-neutral async jobs | Parent pack plus child output jobs |
| R2 storage | Durable input and output assets |
| Ownership/auth patterns | User-scoped access |
| Product reference roles | Product as source of truth |
| UGC fidelity guardrails | Preserve shape, color, branding and recognizable details |
| Product Ad UI conventions | Intake, progress, retry and results language |

## 4. What is actually new

- Marketplace image-pack intent and result type.
- Four role-specific image outputs.
- Amazon-focused validation and presets.
- Per-image regenerate, approve, and download.
- Pack-level progress and partial-success handling.
- Deterministic feature-card composition.
- Batch export as individual files and ZIP.

No new authentication, billing, database platform, storage provider, or standalone
SaaS shell is required.

## 5. External bricks selected

### Ready-made Amazon Product Studio

Adapt:

- 14-reference intake ceiling as an upper UI pattern, not necessarily an MVP limit.
- Drag/drop reference gallery.
- Scene preset vocabulary.
- Aspect-ratio selector where relevant.
- Creation history, processing state, and download interaction.

Do not import:

- NextAuth, Prisma, Stripe/credits, provider CDN upload, generic User schema.
- Provider key logging.
- Polling every processing item without a bounded server-side strategy.

### Skills

Adapt `amazon-product-listing` as the initial four-output role contract.

Adapt from `multi-angle-shots`:

- category-specific detail guidance;
- optional later angles;
- consistent background and lighting vocabulary.

Do not promise factual unseen back, side, port, or label geometry from a single source
photo. Multi-angle generation is creative unless sufficient references are supplied.

Use `product-campaign` only after the four-image pack is stable.

### Academy

Reuse in product language and QA:

- photography brief fields;
- conversion-gap checklist;
- catalog consistency requirements;
- batch naming and baseline placement;
- outcome-led packaging rather than selling "AI images".

## 6. Minimal product contract

```ts
type CommerceImageRole = "hero" | "lifestyle" | "feature" | "detail";

type CommercePackRequest = {
  sourceImages: string[];
  productName: string;
  category: string;
  verifiedFeatures: string[];
  targetBuyer?: string;
  marketplace: "amazon";
  preset?: string;
};

type CommercePackAsset = {
  role: CommerceImageRole;
  status: "pending" | "processing" | "ready" | "failed";
  imageUrl?: string;
  errorCode?: string;
};
```

This is a product contract, not yet a generic provider interface. Provider-specific
payloads stay inside the implementation adapter chosen for the first slice.

## 7. Generation plan

1. Resolve and normalize product references.
2. Ask the user to confirm product facts used in callouts.
3. Create four child specifications with shared identity constraints.
4. Run independent image tasks with bounded concurrency.
5. Persist each result independently so partial success is useful.
6. Validate generated visuals before adding deterministic text.
7. Render the feature card in AlphoGenAI.
8. Present a four-slot review grid with regenerate-per-slot.
9. Export approved files and a ZIP.

## 8. Product fidelity policy

Hard constraints for every role:

- Product silhouette and proportions remain recognizable.
- Brand colors and visible marks remain consistent.
- No invented accessories, controls, ports, certifications, or package contents.
- No unverified feature is written into the image.
- Lifestyle use must be physically plausible.
- Hero image contains no text, watermark, border, badge, or decorative prop.

When a source image cannot support a requested angle or detail, the UI must say so and
offer a creative variation rather than presenting it as factual product documentation.

## 9. Risks and safeguards

### Product drift

Risk: generated images alter geometry, logo, color, or accessories.  
Safeguards: multiple references, explicit source-of-truth constraints, per-output
approval, no automatic publishing, and optional similarity checks.  
Recommendation: fail the asset, not the whole pack, when identity is visibly wrong.

### Unverified claims

Risk: a generated infographic invents specifications or benefits.  
Safeguards: only user-confirmed/extracted facts; deterministic typography; no freeform
claims generated into pixels.  
Recommendation: require confirmation before feature-card generation.

### Marketplace compliance

Risk: marketplace image requirements evolve by region/category.  
Safeguards: label presets with review date, link to current marketplace guidance, and
allow manual override.  
Recommendation: describe output as marketplace-ready, not guaranteed approved.

### External platform terms

Risk: MuAPI terms may restrict competing services or change commercial conditions.  
Safeguards: adapter isolation, no durable provider coupling, legal/commercial review,
and a second provider path where practical.  
Recommendation: do not open a paid public MuAPI-backed module until compatibility is
confirmed.

## 10. Acceptance criteria

### PASS

- All four roles are represented in the result grid.
- At least three of four outputs complete; a failed slot can be retried alone.
- Hero background is visually pure white and contains no added text/props.
- Product identity remains recognizably faithful across approved outputs.
- Feature text exactly matches confirmed facts.
- No provider name or model name appears in user-facing UI or errors.
- Refresh/resume does not lose pack status.
- Approved assets download individually and as one pack.

### FAIL

- Product geometry, logo, color, or included accessories materially drift.
- Feature card contains misspelled or invented text.
- A single child failure destroys successful outputs.
- Re-running one slot regenerates or charges all other slots.
- Provider internals leak to the user.

## 11. Test plan and budget

Before paid QA:

1. Pure role/request validation tests.
2. Route tests for auth, ownership, idempotence, partial success and redacted errors.
3. Build and typecheck.
4. Use one representative product with two or more reference images.
5. Run one capped four-image pack only after explicit spend approval.
6. Stop on the first decisive fidelity failure; diagnose before retrying.

No paid call is authorized by this document.

## 12. Immediate implementation slice

1. Add the Amazon/Product Photography entry to the creation catalog behind a feature
   flag.
2. Reuse URL/upload intake and product-fact confirmation.
3. Add the four-role pack request/result contract and persisted child states.
4. Implement the hero and lifestyle roles first behind one adapter.
5. Add detail and deterministic feature-card composition.
6. Build the review/download grid.
7. Run contract tests, build, then request one capped QA approval.

Do not generalize a universal media-provider interface in this slice. After a second
image module is implemented, extract only the common proven fields and lifecycle.

