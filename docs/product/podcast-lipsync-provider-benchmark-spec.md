# T-1147 Podcast Lip-Sync Provider Benchmark and Abstraction Spec

Status: spec + pure scoring helper first. No runtime provider switch in this slice.
Date: 2026-07-07. Scope: Podcast premium lip-sync only.

## 0. Why this exists

T-1144b proves the current premium pipeline works:

- AlphoGen TTS per segment.
- HeyGen lip-sync per active-speaker segment.
- Cache by current segment audio.
- Modal composites the final two-shot video.
- Cap and opt-in cost gate protect spend.

But HeyGen is not necessarily the final or cheapest production provider. We need a repeatable way to compare alternatives (Descript, BytePlus, Google/Flow/Veo-related options, OpenAI media APIs, Alibaba/Seedream-adjacent options, open-source stacks, and future vendors) without rewriting the product each time.

T-1147 therefore defines how to benchmark and abstract providers, not which one wins today.

## 1. Current coupling audit

| Area | Current state | T-1147 implication |
|---|---|---|
| Provider client | `lib/heygen-client.ts` exposes `createLipsync()` + `getLipsyncTask()` | Adapter boundary should wrap these two calls first. |
| Route orchestration | `/api/podcasts/[id]/lipsync` imports HeyGen directly | Future route should call `provider.createJob()` / `provider.pollJob()` via a registry. |
| Base clips | `podcast_persona_base_clips.provider='heygen'` | Base clips may stay provider-specific; output contract must be provider-neutral. |
| Cache table | `podcast_segment_lipsync_clips.provider`, `mode`, `provider_task_id` already exist | Good enough for multi-provider cache rows; no immediate schema change required. |
| Cost estimator | `LIPSYNC_USD_PER_SECOND = 0.04` observed from HeyGen | Move toward provider-specific rate cards after benchmark. |
| Modal render | Reads ready `video_url` rows, not provider APIs | Already provider-neutral if output is a public MP4 matching segment duration. |

## 2. Provider output contract

Any provider candidate must ultimately produce this:

```ts
interface PodcastLipsyncClipOutput {
  videoUrl: string;       // downloadable MP4, permanent after AlphoGen copies to R2
  durationSeconds: number;
  width: number;          // ideally square 720/1080 for card compositing
  height: number;
  hasAudio: boolean;      // final provider clip can have audio; Modal still muxes final podcast audio
}
```

The provider may internally use image-to-video, avatar video, lip-sync, face reenactment, or a cloud editor workflow. Modal should not care as long as it gets a valid MP4.

## 3. Benchmark gates

A provider cannot be selected for production until it passes these gates:

1. Quality: mouth sync on our own TTS, identity stability, no uncanny face drift.
2. Cost: measured USD/second, not marketing pricing. Include failed-job billing behavior.
3. Latency: wall-clock time per clip and practical concurrency.
4. API fit: server-side API available, async polling/webhook support, deterministic output URL.
5. Cache fit: same inputs can be re-used without paying again.
6. Consent/policy: supports generated/catalog personas and uploaded-consent personas without violating likeness rules.
7. Operational risk: failure modes are recoverable and fallback to `talking_visual` is possible.

## 4. Candidate notes

### HeyGen (current baseline)
- Pros: proven e2e, quality acceptable, API already integrated, cached, fallback-safe.
- Cons: expensive enough to require caps; latency is minutes for multi-segment runs; base clip trim constraints required Modal workaround.
- Role now: baseline, not permanent lock-in.

### Descript
- Useful as workflow inspiration: text-based editing, overdub/voice tooling, scene/timeline ergonomics.
- Unknown as a direct production provider for AlphoGen until API/enterprise capabilities are verified.
- Do not build a Descript clone. Learn from the workflow, and only integrate if there is a server API that can generate/export assets under our cost and consent constraints.

### BytePlus / ModelArk / Seedance-family media
- Promising for image/video generation and possibly lower-cost media operations.
- Needs a direct lip-sync or talking-avatar API contract. If only text/image-to-video is available, it may serve base clips, not segment-level lip-sync.

### Google / Flow / Gemini media
- Useful to watch for Story/creative generation and maybe future avatar/media APIs.
- Google AI Pro subscriptions are consumer UI, not a production API; API access must come through AI Studio / Vertex / Gemini API contracts.

### OpenAI media APIs
- Strong candidate for persona image generation and possibly future video workflows.
- Must be benchmarked on API availability, cost, licensing, and whether it can produce controllable talking-head clips.

### Open-source / self-hosted lip-sync
- Potentially lower marginal cost at scale.
- Must pass quality and ops gates: GPU cost, throughput, face stability, consent boundaries, and maintenance load.

## 5. Recommended sequence

### T-1147a - Benchmark framework (this slice)
- Write this spec.
- Add a pure scoring helper so every provider test gets comparable numeric output.
- No provider calls, no spend, no user-facing UI.

### T-1147b - Adapter interface, no provider switch
- Define `PodcastLipsyncProvider` TypeScript interface.
- Wrap current HeyGen calls behind `heygenProvider` while preserving existing route behavior.
- No new provider, no UI change, no spend beyond existing behavior.
- Status 2026-07-08: implemented in `lib/podcast/lipsync-provider.ts`; `/api/podcasts/[id]/lipsync` now calls the provider adapter instead of importing HeyGen directly.

### T-1147c - Benchmark harness
- Admin-only, one-segment benchmark route that runs a candidate provider against the same base clip and audio.
- Store measurements in docs/log first, not necessarily DB.
- Hard spend cap per run.

### T-1147d - Provider comparison report
- Run at least two real candidates against the same 2-3 segments.
- Compare quality, cost, latency, failure behavior, and integration risk.
- Recommend production provider/tier mapping.

### T-1147e - Runtime provider selection (only after data)
- Add provider registry + config.
- Keep public UI provider-neutral.
- Feature-flag provider selection internally; default remains proven provider until replacement is proven.

## 6. Decision rules

- No provider switch without measured cost and QA clip evidence.
- No provider names in public UI.
- No vendor-specific output URL stored as final output; always copy to R2.
- No hidden spend: every paid path must have cap and opt-in.
- Editing text/audio/persona invalidates only affected segment clips, never the whole cache unnecessarily.
- If a provider fails, fallback is `talking_visual`, not a broken render.

## 7. What "better than HeyGen" means

A candidate is meaningfully better only if at least one is true without major regressions:

- Similar quality at 30%+ lower cost.
- Similar quality at materially lower latency.
- Better quality at comparable cost.
- Better long-form economics through highlights, batching, or caching.
- Better consent, control, or enterprise terms.

Small price differences are not enough to justify a rewrite.

## 8. Immediate recommendation

Keep HeyGen as the working baseline for now. Build the abstraction and benchmark process next, then test alternatives deliberately. Descript remains a workflow/product reference until API fit is verified.
