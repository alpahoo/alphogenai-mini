# Podcast Real Video Duo Spike Report

Date: 2026-07-04

Status: PASS for the technical chain, with a product caveat on source portrait quality.

## Goal

Validate whether AlphoGen can turn a podcast persona portrait into a short talking-avatar clip using HeyGen, then lip-sync that clip with AlphoGen's own podcast TTS audio.

This is the gate before building a production `talking_highlights` / `talking_active_speaker` podcast render mode.

## Chain Tested

1. Start from a podcast persona portrait.
2. Create a HeyGen photo avatar with `createPhotoAvatar`.
3. Generate a short base talking-head clip with `createAvatarVideo`.
4. Lip-sync the base clip with a real AlphoGen podcast segment audio using `createLipsync(..., "precision")`.
5. Download and inspect the final MP4.

## Inputs

### Real AlphoGen TTS Audio

Segment:

- Text: `Actually, a change of environment can help stimulate new ideas and perspectives.`
- Source: existing ready podcast segment audio in R2.
- Duration: about 4.7 seconds.

### Attempt 1: Existing Persona Icon

Persona: `Alex QA Uploaded`

Result:

- `createPhotoAvatar` succeeded.
- First PNG source failed at base generation with HeyGen error: `missing image dimensions`.
- Rehosting the PNG as JPEG fixed the technical image issue.
- Final output still looked like a purple icon/avatar, because the source itself was graphical, not photorealistic.

Conclusion:

This proves the pipeline can process an uploaded persona asset, but it does not satisfy the product goal of "real people like Jogg" unless the source portrait itself is realistic.

### Attempt 2: Synthetic Photorealistic Portrait

Source:

- AI-generated synthetic portrait for testing only.
- Frontal head-and-shoulders podcast host in a studio setting.
- No real identity / no celebrity resemblance.
- Converted to 1024x1024 JPEG and uploaded to R2 through the admin-only experimental route.

## Results

### Photo Avatar

- `createPhotoAvatar` succeeded in under 1 second.
- HeyGen avatar id: `7e0fc22b5d3d4316884b5d1769871da4`.

### Base Clip

- `createAvatarVideo` succeeded.
- Task id: `d64cc87466c546e8a9b20a551996fb19`.
- Completed almost immediately when polled.
- Duration: 4.20571 seconds.

### Lip-sync

- `createLipsync` succeeded.
- Task id: `9d96f287f28f45c5b18bee9a762eb741`.
- Completion time: about 62 seconds in `precision` mode.
- Final MP4:
  - Duration: 4.68 seconds.
  - Resolution: 1280x720.
  - Video: H.264.
  - Audio: AAC 48 kHz stereo.

Local QA artifacts:

- MP4: `C:\tmp\heygen-realistic-person-lipsync.mp4`
- Frame: `C:\tmp\heygen-realistic-person-lipsync-frame.png`

## Product Verdict

PASS: the end-to-end chain works with a realistic portrait source.

The output is recognizably a real-looking talking podcast host, not an icon. This validates the direction for the next production tier:

- `static`: current safe CPU render.
- `talking_highlights`: lip-sync selected active-speaker moments.
- `talking_active_speaker`: lip-sync active speaker clips.
- `full_talking_duo`: premium, expensive, long-running mode.

## Caveats

- This was a single short clip, not a full podcast.
- Cost must still be measured in the HeyGen dashboard.
- The spike used an admin-only experimental route and local/generated test assets.
- Production must not accept arbitrary real faces without explicit likeness/animation consent.
- The source portrait quality matters: icon/stylized personas produce icon/stylized output. Jogg-like results require photorealistic source personas or generated/curated photoreal personas.

## Recommended Next Tickets

1. T-1143a: Base clip cache contract
   - Store/reuse base clips per `persona_id` + aspect + provider mode.
   - Avoid re-generating base clips for every segment.

2. T-1143b: Talking highlight render mode
   - Use lip-sync only for a small subset of active-speaker moments.
   - Fallback to static portrait if HeyGen fails.

3. T-1143c: Cost and plan gating
   - Show cost estimate before render.
   - Make talking mode opt-in.

4. T-1143d: Photoreal persona catalog
   - Replace current icon catalog with curated photoreal synthetic presenters.
   - Keep icon/persona style only for static mode if desired.

