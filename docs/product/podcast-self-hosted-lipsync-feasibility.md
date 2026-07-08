# T-1147e Self-Hosted Lip-Sync Feasibility Spike

Status: spec / audit. Date: 2026-07-09. Scope: podcast premium lip-sync cost-reduction path.

## 0. Executive Decision

Do **not** replace HeyGen yet. HeyGen remains the production baseline because it is already proven end-to-end for the exact AlphoGen contract:

- input: persona/base clip + AlphoGen TTS audio,
- output: per-segment MP4 copied to R2,
- cacheable by segment/audio,
- composited by Modal,
- gated by explicit cost/opt-in,
- fallback-safe.

The next useful step is a **self-hosted/open-source feasibility spike**, because it is the only path that could materially reduce marginal lip-sync cost after the product pipeline is stable.

This ticket is intentionally **not a provider switch**. It defines the benchmark inputs, candidates, acceptance gates, and implementation path for one off-prod spike.

## 1. Why Self-Hosted Is Worth Testing

HeyGen works, but cost is linear with lip-sync seconds. The observed rate is around `$0.04/s`, so full premium long-form quickly becomes expensive. A self-hosted model could change the economics if it can run on rented GPU/Modal/VPS-style infrastructure with acceptable quality.

However, self-hosted is only attractive if it passes all product gates:

- mouth sync quality close enough to HeyGen for short clips,
- identity stability with our generated personas,
- deterministic segment-level MP4 output,
- manageable GPU cost and latency,
- clean failure fallback to `talking_visual`,
- commercial/license clarity,
- maintainable operations.

If any of those fail, HeyGen stays the paid baseline.

## 2. Candidate Families To Screen

These are candidate families, not approvals. Exact repositories, licenses, hardware requirements, and current quality must be verified at spike time.

| Candidate family | Why it matters | Main risk | Initial verdict |
|---|---|---|---|
| Wav2Lip-style | Mature audio-driven lip-sync concept, easy to understand, many forks | Older visual quality; face crop artifacts; license/fork hygiene | Useful baseline, unlikely final quality winner |
| MuseTalk-style | Real-time-ish talking face generation path | Setup/model weights/GPU requirements; identity consistency | Good candidate for first GPU spike if license OK |
| LatentSync-style | Newer diffusion-ish lip-sync quality potential | Heavier GPU, slower, more moving parts | Candidate if quality beats lighter models |
| SadTalker / LivePortrait-style | Strong talking portrait / reenactment concepts | May animate from still image, not our base-clip contract; motion artifacts | Relevant for base-clip generation, not guaranteed segment drop-in |
| Voicebox / local TTS stack | Potentially useful for voice cloning/TTS/STT, not lip-sync video | Not a replacement for video lip-sync | Keep for Voice Lab/TTS benchmarking, separate from this ticket |

## 3. Required Drop-In Contract

A candidate is useful only if the spike can wrap it behind the same contract as the current provider adapter:

```ts
type SelfHostedLipsyncInput = {
  baseClipUrl: string;      // existing persona base clip or extracted face clip
  audioUrl: string;         // AlphoGen TTS segment audio
  segmentId: string;
  expectedDurationSec: number;
};

type SelfHostedLipsyncOutput = {
  videoUrl: string;         // local artifact or R2 copy after spike
  durationSeconds: number;
  width: number;
  height: number;
  hasAudio: boolean;
  provider: "self_hosted_spike";
};
```

Modal/render code should not care whether the clip came from HeyGen or self-hosted as long as the final artifact is a valid MP4 with the active speaker card crop.

## 4. Spike Inputs

Use exactly the same inputs as HeyGen benchmark to avoid subjective drift:

- Persona: existing Maya or Leo catalog persona with ready base clip.
- Audio: one short AlphoGen TTS segment already used in the HeyGen benchmark.
- Target: one segment first, under 5 seconds.
- Output: one MP4 clip, then optional two-shot composite screenshot/video.

No product DB mutation is required for the first spike. Store artifacts under `tmp/` or a clearly experimental R2 path.

## 5. Execution Options

### Option A - Local/GPU workstation spike

Use only if a suitable local GPU is available. This is fastest for iteration but not representative of production unless the same setup can be containerized.

### Option B - Modal GPU spike (recommended)

Create a **separate experimental Modal function** that:

1. downloads model weights or uses a prebuilt image,
2. downloads base clip and audio,
3. runs one segment,
4. uploads result to R2 or returns an artifact URL,
5. logs wall-clock time and GPU class.

This mirrors production deployment more honestly and avoids polluting the Next.js serverless runtime.

### Option C - VPS/Hostinger spike

Use only for CPU/lightweight models. Most convincing lip-sync models are GPU-oriented; CPU-only may be too slow for production. VPS may still be useful for Voicebox/TTS experiments, not necessarily lip-sync video.

## 6. Acceptance Gates

A self-hosted candidate must pass these gates before any product integration:

| Gate | Minimum pass condition |
|---|---|
| Quality | Mouth motion clearly matches speech; no severe identity drift; no obvious face tearing |
| Crop/layout | Output can fit the current rounded-square active speaker card without awkward black bars |
| Duration | Output length within +/- 15% of segment audio or trimmable without artifacts |
| Latency | One short clip completes fast enough to project a short podcast under a practical time budget |
| Cost | Estimated GPU cost is meaningfully lower than HeyGen, not just marginally lower |
| API/cache | Can be wrapped behind `PodcastLipsyncProvider` and cached by segment/audio |
| Failure | On failure, product can fall back to `talking_visual` without corrupting the render |
| License | License and model weights permit commercial SaaS use, or candidate is rejected |

## 7. Suggested First Spike Shape

Recommended slice: **T-1147e1 - Modal GPU one-clip spike**.

Deliverables:

- `docs/product/podcast-self-hosted-lipsync-feasibility.md` updated with measured results.
- An experimental Modal function or script, not connected to user UI.
- One output MP4 + one comparison frame against HeyGen.
- Metrics: setup time, wall-clock time, GPU type, estimated GPU cost, artifact size, visual score.

Hard stop after one clip. No long podcast, no provider switch, no UI.

## 8. Decision Matrix After Spike

| Result | Decision |
|---|---|
| Quality poor | Stop. Keep HeyGen. Revisit when models improve. |
| Quality OK but latency/cost bad | Keep as research only. No product integration. |
| Quality OK and cost much lower | Build provider adapter behind feature flag, then benchmark 3-5 segments. |
| Quality better than HeyGen | Explore premium/provider split, but only after license and ops review. |

## 9. Non-Goals

- Do not expose model names in public UI.
- Do not remove HeyGen.
- Do not spend production credits or GPU time without explicit cap.
- Do not integrate Descript here; Descript remains workflow/polish/editing inspiration until an API contract is confirmed.
- Do not treat Voicebox as a lip-sync provider; it belongs to TTS/voice cloning/STT evaluation.
- Do not promise 45-minute full lip-sync economics until one-clip and short-podcast economics are measured.

## 10. Recommendation

Proceed with **T-1147e1 Modal GPU one-clip spike** only after the current HeyGen premium path remains stable. The spike should answer one question: can an open-source/self-hosted model produce a cacheable per-segment clip good enough and cheap enough to challenge HeyGen?

Until that answer is measured, HeyGen remains the production premium provider and the product stays provider-neutral.
