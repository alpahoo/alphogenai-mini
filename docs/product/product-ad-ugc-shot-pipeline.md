# Product Ad UGC Shot Pipeline

Status: **CODE READY / CAPPED PRODUCT VALIDATION PENDING**

Last reviewed: **29 July 2026**

## Decision

Stop investing in the deterministic `three-shot-v2` compositor as a product
renderer. It proved orchestration, private presenter animation and delivery, but
its poster-like composition is not an acceptable UGC ad.

The replacement is a two-stage pipeline:

1. a provider-neutral `UGCShotProvider` generates exactly three coherent,
   full-frame video shots;
2. an isolated Revideo worker assembles those shots with restrained captions,
   voice-over and branding.

The first provider adapter is Seedance through the existing BytePlus client.
ComfyUI remains a valid future local/GPU adapter, not the editorial layer.

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
2. generate the three coherent shots through the provider-neutral route;
3. verify product fidelity and absence of collage/sticker composition;
4. assemble the three permanent shots in the Linux Revideo worker;
5. review one final ad, then either accept the architecture or change the shot
   provider without rewriting the editor.

Do not run repeated cosmetic generations. One failed gate should produce a
specific provider, storyboard or edit correction.
