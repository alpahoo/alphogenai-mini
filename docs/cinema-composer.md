# Cinema composer (first brick ported from Parallax)

Scope: pure code in `lib/cinema/`. No database, no migration, no interface, no route, no GPU, no gate, no budget. Cinema as a whole is not wired yet.

Source: Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit `a98671e3c47fdb12c42789aee821268aa8f23f6c`: `src/server/cinema/presets.ts` (unchanged) and `src/server/cinema/compose.ts` (adapted). Licence text: `lib/cinema/LICENSE-parallax.txt`.

## What it does

`composeShot({ userId, project, shot, elements, mode, model, exists?, values? })` returns the prompt, the form values and the one reference image for a Studio model.
- The model is read from its manifest and catalog entry (`model-view.ts`). Nothing is assumed that the manifest does not declare: H3 declares one first frame, so at most one image is sent; MOSS declares none, so none is ever sent (with an explanation).
- The first image is the first usable reference of the cast in cast order, then the place. A path is usable if it is inside the owner's folder, has a valid image path and, when the caller supplies `exists`, still exists. Anything else is skipped and counted in the notes.
- The quality is chosen so that a workflow exists (H3 with a first frame: turbo). Ratio and length that the model lacks fall back with a note.
- Starts from the manifest defaults like the Studio form (for H3 the validated 0.4 s audio advance), and keeps only declared overrides, never the prompt.
- `toRunParams` builds the object the run API already validates (`first_frame_path` and the declared parameters), so the server remains the only authority.

## Framing caution (non-blocking)

An element can declare how its reference images are framed (`refFraming`, a shot size id; Luz full-length image: `full`). In animate mode, if the shot asks for a size at least two steps tighter than that framing, `warnings` and `framingWarning` are set (with the suggested size) and nothing else changes: same prompt, same values, same image. Source: the Luz pilot (22/11/2026), where a medium shot from the full-length image gave a double silhouette, while full and wide shots kept the image. One observation, so the threshold is two steps and one step (medium wide) does not warn. Unknown framing, off-scale sizes, stills and text video never warn.

## Proven by tests (Luz case, real library path)

Exact prompt; parameters 9:16, 5 s, turbo; valid for the H3 manifest; variant `i2v`; the Luz library image selected among unusable and extra candidates; accepted by `resolveTemplate` (480 × 832, 124 frames, `first_frame.png`) and refused for another owner; deterministic; MOSS gets no reference; wrong combinations refused.

## Acceptance criteria for the next bricks (not started)

Each brick keeps its own criteria and its own PR.

- **Export with sound.** A project with at least two shots with audio exports one MP4 whose audio track is present for every selected clip, in storyboard order; the duration equals the sum of the clips within one frame of tolerance per cut; clips of different sizes are padded without distortion; the export runs where `ffmpeg` exists (not on Vercel), is read only toward the gates and budgets, and the file is private and reachable by a signed link; a shot without a finished clip is reported, not silently skipped.
- **Reuse an MOSS image as a first frame.** A finished MOSS image of the signed-in administrator can be promoted into the reference storage under their own folder, is checked for owner, format (png/jpg/webp) and size, appears as a reference that H3 accepts, never touches the MOSS gate or a budget, and promoting a result of another administrator is refused. The promoted copy follows the same deletion rules as library images.
- **Storage of projects, shots and takes.** Needs a migration (tables with RLS and GRANTs); validated with the administrator first.
