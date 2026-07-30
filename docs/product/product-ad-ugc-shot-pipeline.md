# Product Ad UGC Shot Pipeline

Status: **DUAL-MODE CODE READY / CAPPED PRODUCT VALIDATION PENDING**

Last reviewed: **29 July 2026**

## Decision

Stop investing in the deterministic `three-shot-v2` compositor as a product
renderer. It proved orchestration, private presenter animation and delivery, but
its poster-like composition is not an acceptable UGC ad.

The product now exposes two provider-neutral execution paths:

1. `native_multishot`: one `UGCNativeAdProvider` task asks Seedance to generate
   a complete 15-second three-beat ad with native synchronized audio;
2. `directed_edit`: `UGCShotProvider` generates exactly three coherent,
   full-frame video shots and an isolated Revideo worker assembles them with
   restrained captions, voice-over and branding.

The native path is the fastest and least complex option. The directed path is
reserved for cases requiring deterministic copy, voice, timing and branding.
The first adapters use Seedance through the existing BytePlus client. ComfyUI
remains a future local/GPU provider adapter, not an immediate dependency.

Framer Motion remains an interface-animation dependency only. It does not
assemble generated clips or export the final MP4.

## What was retained from Open-AI-UGC

The audit retained only the useful architectural idea: route a normalized shot
request to a replaceable asynchronous provider and persist its task state.

The following are deliberately not imported:

- authentication and account UI;
- Stripe and credit logic;
- Prisma schema;
- MUAPI coupling;
- the surrounding SaaS application.

## V1 contract

- Exactly three shots: `creator_hook`, `product_demo`, `lifestyle_cta`.
- Each shot is 4-8 seconds.
- Product references remain attached to every relevant generation.
- Presenter video is optional and used only for the hook and CTA.
- No generated speech, captions, logos or text inside provider shots.
- No collage, floating product sticker or poster layout.
- Provider tasks are reserved and persisted before the next paid task starts.
- Completed provider outputs are copied to permanent R2 URLs.
- Public product surfaces never expose provider names or task IDs.

### Native multi-shot

- One 15-second provider task.
- Explicit timed beats: creator hook, product demo, lifestyle CTA.
- Native synchronized speech and ambient audio.
- No generated captions, text, watermark, poster layout or floating cutouts.
- Finished provider output is copied to permanent R2 storage and exposed through
  the normal AlphoGen job result.

### Directed edit

- Exactly three separate shots: `creator_hook`, `product_demo`,
  `lifestyle_cta`.
- Revideo is used only after all three permanent shot outputs are ready.
- This path owns exact voice-over, captions, branding and edit timing.

## Runtime placement

| Component | Runtime |
|---|---|
| Product extraction, storyboard, state | Next.js |
| Heavy image/video generation | BytePlus, Modal GPU or another provider |
| Queue and edit orchestration | Hostinger VPS |
| Deterministic three-shot assembly | Revideo worker on Hostinger |
| Durable media | R2 |

The Hostinger VPS is not expected to run heavy diffusion models unless a
suitable GPU is actually available. It owns the queue, retries and Revideo
assembly.

## Revideo worker boundary

The worker receives a manifest containing three permanent MP4 URLs, durations,
copy and optional voice-over. It contains no generation-provider credentials.
Production deployment must place it behind a signed AlphoGen request or an
authenticated private reverse proxy, enforce concurrency and quotas, upload the
final MP4 to R2, then report the permanent URL.

The local Windows render smoke timed out while the worker typecheck succeeded.
This is not treated as a product PASS. The supported deployment target is the
committed Node 22 Linux Docker image; its first Hostinger render is a remaining
gate.

## Acceptance gate

Run one meaningful, capped Beats Powerbeats Pro 2 validation:

1. extract product references from the supplied product page;
2. run `native_multishot` once and review the complete provider output;
3. if the native output meets the product bar, accept it as Fast / Best Value
   without invoking Revideo;
4. otherwise reuse the same brief and references in `directed_edit`, generate
   three shots, then assemble them in the Linux Revideo worker;
5. choose the default path from product fidelity, coherence, cost and edit
   control without changing the public Product Ad contract.

Do not run repeated cosmetic generations. One failed gate should produce a
specific provider, storyboard or edit correction.

## Acceptance result - 2026-07-30

The capped `native_multishot` validation completed as production job
`ce13f059-408d-4a51-875d-fa097ea6a9f7`.

- Technical gate: PASS. The verified creator identity path produced a valid
  1080x1920, 15.07-second native video with a photoreal creator and one coherent
  worn-product close-up.
- Product gate: FAIL. The provider altered product geometry and colors, used an
  awkward face close-up, and ended on a generic product lineup without benefit,
  offer or CTA.

The native path remains useful for Fast/concept output, but it is not the
default faithful Product Ad renderer. Per the gate above, the next validation
uses `directed_edit`: three separately generated full-frame shots with stronger
product-reference constraints, followed by one deterministic Revideo assembly.

## Directed edit V2 implementation - 2026-07-30

The first directed-edit implementation is code-ready and intentionally removes
the source of the native product drift:

- `creator_hook` and `lifestyle_cta` receive the verified creator identity but
  no product image. Their prompts forbid showing, inventing, holding or wearing
  a product.
- `product_demo` receives exactly one product image as an immutable first frame.
  The model may animate only camera movement and existing light.
- the full Seedance 2 quality route is used for these three final shots; the
  Fast model remains a concept preview only;
- French voice-over, captions and CTA are generated separately and persisted
  before any paid shot task starts;
- Revideo receives the three permanent MP4s and the deterministic edit manifest.
  It owns voice, captions, restrained branding and closing CTA.

Local validation passed without provider spend. The remaining infrastructure
gate is the private authenticated Hostinger service around the currently
CLI-only Revideo worker. Only after that service is deployed should one capped
Powerbeats three-shot QA be started.
