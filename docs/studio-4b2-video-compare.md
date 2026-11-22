# Studio Phase 4B.2: video comparison and audio information

Read only. No GPU, no migration, no change to gates, budgets, reservations, finance status or the 0.4 s audio advance.

## What was reused (nothing duplicated)

- History and ownership: `/api/admin/comfy/history` is already scoped to the signed-in administrator. Comparison picks from that list only.
- Signed links: the existing `/api/admin/comfy/media/[id]` route (admin check, `owner_id` filter, `withdrawn_at is null`, run must be `done`, 600 s signed URL, `no-store`). No route was added or changed. Its tests already cover other-user and withdrawn assets.
- Compare state: the existing `compareWith` / `setCompareWith` state (reset when the displayed run changes).
- Link refresh: the existing one-retry-on-error behaviour, now in `components/studio/private-video.tsx` (moved out of `result-stage.tsx`, same behaviour, clearer error text).

## What was added

- `lib/studio/video-compare.ts` (pure): candidates, run facts, duration note, speech precaution, one-audible-track rule.
- `components/studio/video-compare.tsx`: "Compare runs" (two distinct runs), improved Original/Corrected compare, sound switch, audio information.
- Result tabs: Corrected, Original, Compare, Compare runs.

## Synchronisation: what is and is not promised

Implemented: "Play both from start" (both to 0, then play), "Pause both / Resume both", and best-effort mirroring of play, pause and seeking from either player to the other (tolerance 0.15 s before a mirrored seek).

Not promised:
- Frame-exact sync. Browsers do not guarantee it: two `<video>` elements have independent decoders and clocks, buffering can make one start a little later, and mirrored events arrive after the fact. The UI says so.
- No continuous drift correction. A drift that builds up during long playback is not corrected.
- Different lengths: the shorter clip stops on its last frame, the longer one continues. The UI states which clip is shorter once both durations are known.
- Mirroring pause is skipped when a clip ends, so a short clip ending does not stop the long one.
- Autoplay: "Play both" is a user click, which browsers allow. Starting playback from a native control of one player also starts the other.

## Audio

- Plain-language explanation of Original, Corrected and the trade-off (collapsible, under the single video).
- Non-blocking precaution when the prompt seems to ask for speech that is not explicitly delayed ("after a pause", "then"...). It is a text heuristic: it says so and never claims the sound was analysed. It can miss speech and can flag prompts with no speech.
- Only one track is audible at a time, in both compare modes (A / B / Off, Original / Corrected / Off). Default: A for run comparison, Corrected for Original/Corrected.
- How to measure the real offset from existing files: `docs/audio-offset-diagnostic.md`.

## Responsive report (Chromium, mocked APIs, local WebM files)

Checked at 375, 768, 1024 and 1440 px inside an admin-like shell: single video, Compare runs, Compare (versions).

| Width | Horizontal overflow | Compare layout | Notes |
|---|---|---|---|
| 375 | none | stacked, page scrolls | controls on top, A then B, facts table scrolls inside its own box |
| 768 | none | side by side | |
| 1024 | none | side by side, small | three columns plus history leave little height, videos are about 174 px wide |
| 1440 | none | side by side | |

Checked per width: A/B labels, controls reachable by keyboard (Enter on "Play both from start" starts both), different formats (16:9 next to 9:16) keep their ratio (letterboxed, never stretched), expired link refreshed once and loaded, removed file shows a clear message, one-run history disables "Compare runs", play/pause/seek mirrored, shorter clip ends while the longer continues, only one track audible, 0 non-GET requests to `/api/` during all of it.

Defects found and fixed while testing: second video overlapping the controls on phones; single video collapsing to 60 px high at 1024 px after adding the audio notes; controls hidden below the fold on desktop (moved above the videos); summary line under 32 px high.

Known limits: at 1024 px (landscape tablet) the compare view is small; controls are compact (28 to 30 px) as elsewhere in Studio at the `lg` breakpoint. "Reuse settings", "New seed" and download buttons stay at 30 px, unchanged by this PR.

## Recommendations for the audio, later

Without GPU: measure the offset on the existing runs (diagnostic doc), on several scenes, before deciding anything.

Needs new GPU generations (not done, needs a separate authorisation):
1. A small test set with sharp audible events (clap, footsteps) to measure the real offset per scene.
2. Runs at 0.2 and 0.6 s on the same seed to compare shifts.
3. A prompt variant with speech delayed after the first second, to check the caution's usefulness.
4. Any per-scene automatic offset estimation, only after enough measurements.
