# UGC Studio Spec

Date: 2026-06-09
Status: Product spec, no runtime change

## Goal

UGC Studio turns product and outfit references into a creator-style video:

- user uploads a product image,
- optionally uploads an outfit/clothing image,
- selects or reuses a verified face / saved look / avatar,
- writes or generates a short creator script,
- AlphoGen builds a scene plan that demonstrates the product naturally.

The user-facing promise is: **drop in a product, direct a creator, publish a social-ready demo**.

## Target User Flow

1. Open Create -> Product Video or future UGC Studio.
2. Add product image.
3. Optional: add outfit/clothing reference.
4. Choose presenter:
   - verified face,
   - saved Look,
   - avatar,
   - no fixed person.
5. Choose format:
   - TikTok/Reels 9:16,
   - square feed,
   - landscape ad.
6. Choose angle:
   - testimonial,
   - unboxing,
   - try-on,
   - product demo,
   - before/after,
   - founder-style pitch.
7. Generate Director plan.
8. Edit script/scenes.
9. Generate video, then export Social Pack.

## Existing Building Blocks

- Create flow supports `references_payload`.
- Reference roles already include `outfit_style`.
- `Use as reference` can copy a completed job image into the private `references` bucket as `outfit_style`.
- Verified faces already map to `byteplus_asset_ids` for Seedance 2.0.
- AI Director already supports editable scene prompts and quality/cost readout.
- Social Pack already handles final export formats.
- Saved Looks now surface in Library and can be reused in avatar/cinematic mode.

## Reference Contract V1

V1 can avoid new DB schema by using the existing reference payload:

```ts
{
  images: [
    { role: "outfit_style", storage_path: "...", filename: "product.png" },
    { role: "outfit_style", storage_path: "...", filename: "outfit.png" }
  ]
}
```

Because `ReferenceRole` does not yet include `product`, V1 should treat product and outfit as named `outfit_style` references with clear prompt instructions:

- image 1 = product reference,
- image 2 = outfit / styling reference.

V2 can add explicit roles:

- `product_reference`,
- `outfit_reference`,
- `background_reference`.

Adding those roles requires updating:

- `lib/types.ts`,
- `lib/validate-references.ts`,
- create UI labels,
- tests.

## Recommended Model Routing

Provider names remain hidden in public UI.

V1 routing:

- Product/no human: model with image references enabled.
- Verified face + product: Seedance 2.0 direct with verified face assets and product/style reference where safe.
- Raw human photo: avoid direct raw face upload; require verified face or avatar path.
- Saved Look: use avatar/cinematic look reuse when the user wants the same creator shot with a new product script.

## Director Plan Shape

UGC plans should generate 3-6 short scenes:

1. Hook: creator shows or introduces the product.
2. Problem: what the product solves.
3. Demo: product in hand / close-up / use case.
4. Outfit/style beat when clothing reference exists.
5. Benefit: concise, believable claim.
6. CTA: soft social ending.

Editable fields:

- script line,
- camera framing,
- product mention,
- asset chips,
- duration,
- tone.

## UX Surface

### Create Hub

Make Product Video evolve into UGC Studio, not a separate buried feature.

Primary cards:

- Product Demo,
- Try-on / Outfit,
- Testimonial,
- Unboxing,
- Creator Ad.

### Create Flow

Add a compact UGC panel near references:

- Product image required,
- Outfit image optional,
- Creator optional,
- Script angle,
- Platform format,
- Director plan button.

No marketing explanations in-app; controls should feel like a studio.

## Safety And Consent

- Do not imply clothing swap onto a real person without consent.
- Raw real-person photos should use the verified-face workflow.
- Product claims should remain generic unless the user provides exact claims.
- Avoid provider names in public UI.
- Do not promise exact try-on fidelity in V1; phrase as "style/outfit reference".

## Non-Goals V1

- No e-commerce catalog ingestion.
- No automatic product fact verification.
- No exact garment simulation guarantee.
- No public UGC marketplace.
- No new migration until reference-role changes are accepted.

## Implementation Slices

1. **T-801a UGC spec**: this document.
2. **T-801b Prompt builder helper**: pure helper that turns product/outfit/script angle into Director scenes. Done in `lib/ugc-director.ts`.
3. **T-801c UI panel**: Product/Outfit/Angle controls in create flow, UI-only over existing references.
4. **T-801d Reference role expansion**: optional `product_reference` migration-free type/payload update, with validation tests.
5. **T-801e End-to-end polish**: saved Look / verified face integration and Social Pack CTA.
