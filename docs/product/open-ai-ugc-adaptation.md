# Open-AI-UGC adaptation for AlphoGen

## Decision

AlphoGen adapts the useful generation contract from
`Anil-matcha/Open-AI-UGC` without importing its application shell.

The recommended UGC path is now:

1. one creator script or creative brief;
2. one verified creator identity;
3. up to six explicit product or scene reference images;
4. one provider-neutral native video request;
5. one coherent creator performance with native speech.

BytePlus Seedance is the first provider behind this contract. Provider choice
remains internal to AlphoGen.

## What the upstream project actually provides

The upstream MIT project is a strong self-hosted studio shell around MUAPI:

- free-form prompt or script;
- up to seven inline image references;
- model-specific controls;
- asynchronous generation and polling;
- generation history, authentication, credits and billing.

It does not contain a hidden UGC editor, deterministic multi-shot compositor,
advanced caption engine or speech pipeline. Framer Motion animates the web UI,
not the rendered video. Final UGC quality still comes from the selected video
model and the references supplied to it.

## What AlphoGen reuses

- The product interaction: script plus ordered references.
- The one-generation-first approach for visual and character coherence.
- Provider-neutral model routing.
- Private reference uploads and asynchronous jobs.

## What AlphoGen does not import

- MUAPI coupling;
- NextAuth;
- Prisma;
- Stripe and the upstream credit ledger;
- the upstream database schema;
- the unsigned webhook pattern;
- the upstream application UI.

AlphoGen already has authentication, Supabase, R2, provider routing, jobs,
consent controls and billing foundations.

## Revideo position

Revideo is optional post-production only. It may add deterministic branding,
captions, CTA or format variants after a native UGC output has passed the
quality gate. It is not required to generate the creator performance and must
not be used to disguise unrelated clips as UGC.

The previous three-shot directed assembly remains available only as a legacy
comparison path.

## Safety and storage

- User references are uploaded to the private `references` bucket.
- The API accepts canonical storage paths, not client-provided public URLs.
- Paths are restricted to the authenticated user's folder.
- Inputs are normalized to permanent R2 JPEGs before the provider call.
- Automatic page extraction contributes one packshot only; multiple references
  must be selected explicitly to avoid forwarding incidental faces.

## Quality gate

The next paid QA must be a single meaningful 15-second generation. It passes
only if:

- the same creator identity remains coherent;
- the creator visibly wears, holds or uses the exact product;
- the product is recognizable and faithful;
- speech is intelligible and feels native to the performance;
- the result is not a product montage with a detached voice-over.

No Revideo assembly is required for this gate.
