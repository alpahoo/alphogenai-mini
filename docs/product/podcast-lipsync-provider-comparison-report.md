# T-1147d Podcast Lip-Sync Provider Comparison Report

Status: comparison report v0. Date: 2026-07-08. Scope: podcast premium lip-sync provider decision.

## 0. Executive Decision

Keep **HeyGen** as the production baseline for podcast premium lip-sync for now. Do **not** switch provider yet.

Why: HeyGen is the only provider currently proven end-to-end inside AlphoGen for the exact contract we need:

- input: AlphoGen TTS audio + persona base clip,
- output: downloadable MP4 segment clip,
- async task/poll API,
- cacheable result copied to R2,
- fallback-safe in Modal,
- measured cost and latency.

The alternatives remain useful, but not yet proven as drop-in replacements for segment-level lip-sync.

## 1. Baseline: HeyGen

| Gate | Result |
|---|---|
| Quality | Pass for V1. Mouth sync acceptable, identity stable enough, QA confirmed only active speaker moves. |
| Cost | Observed dashboard rate: about **$0.04/s** (`$0.20/5s`). |
| Latency | Full short podcast QA: 4 new clips in ~181s, cached clips free. |
| API fit | Good: create task + poll task. Already integrated. |
| Cache fit | Good: current cache/dedup avoids re-spend per unchanged segment audio. |
| Consent fit | Good enough for generated/catalog personas; uploaded personas require explicit consent flow already planned. |
| Operational fit | Good after T-1144b fixes: Modal trim, R2 unique keys, fallback talking visual. |

Verdict: **production baseline**, not permanent lock-in.

## 2. Candidate Screening

### Descript

Descript is valuable as a **workflow/product reference**: text editing, overdub-style voice flows, timeline ergonomics, captions, and regenerate workflows. It is **not yet a provider replacement** until an official server API can do the exact AlphoGen job: programmatic talking/lip-sync clips from our audio + controlled persona/base clip, with export URL and commercial terms.

Verdict: **workflow inspiration / enterprise discovery**, not benchmarkable as a drop-in lip-sync provider yet.

### Google Gemini / Veo / Flow

Official Gemini API docs expose video generation models such as Gemini Omni Flash and Veo 3.1 for video generation and editing workflows. That is promising for Story/Cinematic and maybe future base-video generation, but it is **not the same contract** as segment-level lip-sync from an existing base clip plus our TTS audio.

Verdict: **watchlist for video generation / story / base clips**, not current lip-sync replacement.

### OpenAI Video / Media APIs

OpenAI video generation is relevant for future creative generation. But the current benchmark need is not generic text-to-video; it is deterministic lip-sync/talking-head regeneration per segment. Until a model/API exposes that contract, OpenAI is better treated as a candidate for persona image/video generation or future creative workflows, not the current lip-sync slot.

Verdict: **watchlist**, not current drop-in lip-sync provider.

### BytePlus / ModelArk / Seedream / Dola

BytePlus/ModelArk is already useful in our stack for media generation, especially high-quality photorealistic portrait generation. It may also be useful for base clips or visual generation. But in our current integration we do not have a direct, proven audio-driven lip-sync endpoint matching the provider contract.

Verdict: **strong for portraits/base visual generation**, not currently proven for segment lip-sync.

### Open-source / self-hosted lip-sync

This is the most plausible cost-reduction path after HeyGen because it could avoid per-second SaaS fees. But it carries quality and ops risks: GPU cost, model setup, face drift, throughput, and maintenance. It should be benchmarked only after a small Modal/GPU spike with the same base clip/audio pair.

Verdict: **best next benchmark candidate**, but not production-ready without a spike.

## 3. Comparison Table

| Provider / path | Drop-in API fit today | Cost confidence | Quality confidence | Operational risk | Recommendation |
|---|---:|---:|---:|---:|---|
| HeyGen | High | High | High enough | Medium | Keep as baseline |
| Descript | Unknown | Unknown | Unknown | High | Product reference only |
| Google Veo / Flow | Low for lip-sync | Medium | Unknown for this contract | High | Watchlist / story-video |
| OpenAI video | Low for lip-sync | Unknown | Unknown for this contract | High | Watchlist / creative media |
| BytePlus media | Low for lip-sync | Medium | Good for portraits | Medium | Use for portraits/base clips |
| Self-hosted lip-sync | Medium after spike | Potentially strong | Unknown | High | Next real benchmark |

## 4. Production Recommendation

1. Keep HeyGen as the paid premium provider for V1.
2. Keep the public UI provider-neutral.
3. Do not integrate Descript as a provider unless an official/export-capable API is confirmed.
4. Use Descript as workflow inspiration later: text editing, overdub-style edits, timeline UX, captions, regenerate one line.
5. For actual cost reduction, run the next benchmark against a self-hosted/open-source lip-sync candidate or any vendor that exposes the exact audio+base-clip-to-MP4 contract.

## 5. Next Slice

Recommended next work: **T-1147e-spike - self-hosted/open-source lip-sync feasibility**.

Goal: one Modal/GPU or local/off-prod spike using the same benchmark inputs:

- base clip: existing Maya/Leo ready base clip,
- audio: one short AlphoGen TTS segment,
- output: MP4 copied locally/R2,
- compare against HeyGen on quality, latency, estimated GPU cost, and failure behavior.

Hard stop if quality is visibly worse or GPU cost/latency makes it non-competitive.

## 6. T-1154 Balanced Hardening Gate (2026-07-12)

LatentSync passed a three-clip production mini-batch with the public Balanced
mode kept locked:

- 3/3 clips ready, zero provider fallback and zero failed task;
- two A10G containers maximum, with the third task queued as intended;
- 13.80 seconds of valid output for 481.93 cumulative GPU seconds;
- directional provider cost recorded at $0.17 total ($0.05-$0.06 per clip);
- visual review passed across both personas with stable identity and real mouth motion;
- cold latency remained 124-220 seconds per clip, so public activation still
  requires an explicit waiting/queue UX and operational monitoring.

Decision: **successful internal beta gate; keep public Balanced locked**. The
next product slice should add queue/ETA copy and a controlled beta cohort rather
than silently replacing Premium.
