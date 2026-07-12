# T-1150 — Podcast Lip-Sync Provider Benchmark Matrix

Status: measured matrix v1. Date: 2026-07-12. Scope: internal provider routing for Podcast Video.

## Decision

- **Premium stays on the current production baseline.** It is the only path with high-confidence evidence across a full short podcast and a same-input comparison.
- **LatentSync on Modal remains the leading Balanced/Economy candidate.** It is materially cheaper on the measured clip and visually very good, but slower, operationally heavier, and supported by only one reviewed sample.
- **MuseTalk is rejected for now.** The spike did not produce an MP4 with the pinned experimental package.
- **Runway/Act-Two is not scored yet.** Marketing capability or generic character generation is not evidence for AlphoGen's exact contract: `base clip + AlphoGen TTS segment -> downloadable lip-synced MP4`.

Provider names remain internal. Users choose **Economy, Balanced, Premium, or Cinema**; the router chooses the engine.

## Same-input evidence

The reviewed comparison used the same AlphoGen persona base clip and the same real TTS segment.

| Path | Output | Wall time | Measured cost | Human review | Evidence |
|---|---:|---:|---:|---|---|
| Current SaaS baseline | 3.31 s | 90.06 s | $0.13 (~$0.04/output-s) | Best of the two by a small margin | High: 8-line production QA + comparison clip |
| LatentSync / Modal A10 | 3.36 s | 151.12 s | ~$0.046 GPU (~$0.0138/output-s) | Very good, slightly behind baseline | Medium: one reviewed technical pass |
| MuseTalk / Modal A10 | No MP4 | Failed | Not comparable | Not reviewable | Low: technical failure |

The Modal calculation uses the current official A10 price of `$0.000306/s`. It is a compute estimate based on measured wall time; storage, CPU/memory, regional multipliers, cold starts, and future pricing can change the final bill.

## Scored matrix

| Path | Score | Confidence | Verdict | Why |
|---|---:|---|---|---|
| Current SaaS baseline | **82** | High | `production_candidate` | Best reviewed quality, proven API/cache/fallback path |
| LatentSync / Modal A10 | **62** | Medium | `watchlist` | ~3x cheaper measured output-second, but slower and not production-packaged |
| MuseTalk / Modal A10 | **28** | Low | `reject` | No valid output, unresolved packaging/runtime stack |

Production promotion requires all of the following:

1. technical pass on the exact AlphoGen contract,
2. human visual review pass,
3. at least three same-input samples,
4. server-side adapter, durable output URL, cache, consent fit, and failure fallback,
5. measured cost and latency under the intended concurrency model.

A high theoretical score without this evidence remains `watchlist`.

## Long-form economics (directional)

These projections assume every second is premium active-speaker lip-sync and no cache reuse. They are deliberately conservative.

| Active lip-sync duration | Current baseline | LatentSync measured projection |
|---:|---:|---:|
| 10 min | ~$24.00 | ~$8.26 |
| 45 min | ~$108.00 | ~$37.15 |

This validates the tier strategy:

- **Economy:** must use a cheaper path, selective sync, or fewer premium seconds.
- **Balanced:** best candidate is a productionized self-hosted path after more samples and warm/batched performance work.
- **Premium:** current baseline until another provider clears every gate.
- **Cinema:** reserve for a demonstrably better premium provider such as Act-Two or equivalent after a same-contract benchmark.

## Next measured work

1. Run LatentSync on 3–5 varied segments: two personas, short/long lines, English/French, quiet/expressive delivery.
2. Record cold and warm latency separately; estimate concurrency and batch economics.
3. Build no production adapter until those samples pass identity, mouth-sync, crop, and failure tests.
4. When Runway Dev access is available, run exactly one capped Act-Two clip through the same harness before assigning it to Cinema.
5. Keep Descript outside this provider matrix unless it exposes an official server API for the same lip-sync contract; use it later as an edit/polish/export integration.

