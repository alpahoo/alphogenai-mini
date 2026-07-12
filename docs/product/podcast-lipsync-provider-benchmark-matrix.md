# T-1150 — Podcast Lip-Sync Provider Benchmark Matrix

Status: measured matrix v1. Date: 2026-07-12. Scope: internal provider routing for Podcast Video.

## Decision

- **Premium stays on the current production baseline.** It is the only path with high-confidence evidence across a full short podcast and a same-input comparison.
- **LatentSync on Modal is the feature-flagged Balanced candidate.** It is materially cheaper and passed four moving human reviews, but remains slower than the Premium baseline and is not publicly enabled yet.
- **MuseTalk is rejected for now.** The spike did not produce an MP4 with the pinned experimental package.
- **Runway/Act-Two is not scored yet.** Marketing capability or generic character generation is not evidence for AlphoGen's exact contract: `base clip + AlphoGen TTS segment -> downloadable lip-synced MP4`.

Provider names remain internal. Users choose **Economy, Balanced, Premium, or Cinema**; the router chooses the engine.

## Same-input evidence

The reviewed comparison used the same AlphoGen persona base clip and the same real TTS segment.

| Path | Output | Wall time | Measured cost | Human review | Evidence |
|---|---:|---:|---:|---|---|
| Current SaaS baseline | 3.31 s | 90.06 s | $0.13 (~$0.04/output-s) | Best of the two by a small margin | High: 8-line production QA + comparison clip |
| LatentSync / Modal A10 | 14.56 s total | 581.32 s total | ~$0.178 GPU (~$0.0122/output-s) | All 4 moving outputs approved; baseline slightly ahead | High: 4 technical + 4 moving human reviews |
| MuseTalk / Modal A10 | No MP4 | Failed | Not comparable | Not reviewable | Low: technical failure |

The Modal calculation uses the current official A10 price of `$0.000306/s`. It is a compute estimate based on measured wall time; storage, CPU/memory, regional multipliers, cold starts, and future pricing can change the final bill.

## Scored matrix

| Path | Score | Confidence | Verdict | Why |
|---|---:|---|---|---|
| Current SaaS baseline | **82** | High | `production_candidate` | Best reviewed quality, proven API/cache/fallback path |
| LatentSync / Modal A10 | **63** | High | `watchlist` | ~3.3x cheaper measured output-second; now packaged behind a private Balanced feature flag with fallback |
| MuseTalk / Modal A10 | **28** | Low | `reject` | No valid output, unresolved packaging/runtime stack |

Production promotion requires all of the following:

1. technical pass on the exact AlphoGen contract,
2. human visual review pass,
3. at least three same-input samples reviewed in motion by a human,
4. server-side adapter, durable output URL, cache, consent fit, and failure fallback,
5. measured cost and latency under the intended concurrency model.

A high theoretical score without this evidence remains `watchlist`.

## Long-form economics (directional)

These projections assume every second is premium active-speaker lip-sync and no cache reuse. They are deliberately conservative.

| Active lip-sync duration | Current baseline | LatentSync measured projection |
|---:|---:|---:|
| 10 min | ~$24.00 | ~$7.33 |
| 45 min | ~$108.00 | ~$32.98 |

This validates the tier strategy:

- **Economy:** must use a cheaper path, selective sync, or fewer premium seconds.
- **Balanced:** best candidate is a productionized self-hosted path after more samples and warm/batched performance work.
- **Premium:** current baseline until another provider clears every gate.
- **Cinema:** reserve for a demonstrably better premium provider such as Act-Two or equivalent after a same-contract benchmark.

## Next measured work

1. Run one private Balanced end-to-end podcast QA after deploying the adapter and enabling the server flag only in the controlled environment.
2. Add a French sample, then record cold and warm latency separately and estimate concurrency/batch economics.
3. Keep the public Balanced selector locked until the private adapter/fallback QA passes.
4. When Runway Dev access is available, run exactly one capped Act-Two clip through the same harness before assigning it to Cinema.
5. Keep Descript outside this provider matrix unless it exposes an official server API for the same lip-sync contract; use it later as an edit/polish/export integration.

## T-1152 controlled production adapter

LatentSync is packaged as a separate, pinned Modal app with asynchronous `start/status` endpoints. The Next.js provider adapter keeps the existing neutral create/poll contract. Balanced routes to LatentSync only when both `PODCAST_LATENTSYNC_BALANCED_ENABLED=true` and `MODAL_LATENTSYNC_URL` are configured; otherwise it fails closed to Premium. Start/poll failures automatically fall back to the current baseline, and the provider actually used is persisted in the segment cache. Premium and Balanced cache rows coexist and the Modal renderer selects the provider appropriate to the requested quality tier.

Deployment: `alphogenai-latentsync`, health-checked on 2026-07-12 at `https://alpahoo--alphogenai-latentsync-latentsync-api.modal.run/health`. The production flag remains off pending a private end-to-end QA.
