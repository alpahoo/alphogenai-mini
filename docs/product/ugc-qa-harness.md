# UGC QA Harness

Date: 2026-06-09
Status: T-803d delivered, no backend change

## Goal

Provide a small, repeatable QA set for UGC grounding claims before AlphoGen markets
stronger promises such as product grounding, logo preservation, or exact try-on.

This harness does not run real generations automatically. It only builds deterministic
fixtures from pure helpers, so agents can verify UI copy, Director scenes, readiness
labels, and provider-neutral wording without spending credits.

## Source Of Truth

- `lib/ugc-qa-harness.ts` defines the QA cases.
- `lib/__tests__/ugc-qa-harness.test.ts` verifies the generated fixtures.
- `lib/ugc-capabilities.ts` defines model capability levels.
- `lib/ugc-readiness.ts` turns those capabilities into user-facing readiness labels.
- `lib/ugc-director.ts` builds the Director scenes for valid UGC cases.

## Current Fixture Set

| Case | Purpose | Expected readiness |
|---|---|---|
| `product_grounded_demo` | Product-visible demo with a short social script. | `product_grounded` |
| `outfit_style_direction` | Outfit/style reference where exact try-on is unavailable. | `exact_tryon_unavailable` |
| `style_only_missing_product` | Negative case: outfit without product. | `style_only` |
| `verified_identity_missing` | Creator identity selected but not available. | `needs_verified_identity` |
| `avatar_presenter_product` | Presenter/avatar script that must not imply product grounding. | `ready` |

## Manual QA Checklist

When a future validation run is approved:

1. Use the fixture IDs above as the scenario names.
2. Generate only one case at a time and record job IDs in a separate QA note.
3. Check whether the product is visible in the hook and demo scenes.
4. Check whether product category and dominant color stay recognizable.
5. For outfit cases, confirm the UI says style direction, not exact try-on.
6. For avatar/presenter cases, confirm the product is not described as grounded.
7. Confirm no public UI or exported copy exposes provider or aggregator names.

## Non-Goals

- No automatic generation.
- No backend route.
- No DB migration.
- No exact try-on claim.
- No logo/text preservation claim until a separate validation slice proves it.
