# Hosted staging rehearsal: report (2026-11-24T02:06:36.034Z)

Overall API checks: **FAIL**

## API checks
### longcat
- PASS anonymous: readiness refused (401)
- PASS admin: gate open, H100 executor, 0.75 reservation
- PASS non-admin: refused (403) on readiness, audio library and runs
- PASS audio upload (9.72 s WAV) accepted
- PASS audio upload: 12 s MP3 accepted by the API (duration is checked by the broker)
- PASS portrait upload through the existing library (201)
- PASS the non-admin sees nothing of it
- PASS path traversal refused (400)
- PASS locked parameter refused (400)
- PASS a missing audio file reserves nothing (400)
- PASS render accepted (202)
- PASS DUPLICATE: same inputs, new key -> the SAME run
- PASS DUPLICATE: same key twice -> the same run
- PASS a different request while one is active is refused (409)
- PASS audio of an ACTIVE render cannot be deleted (409)
- PASS another account cannot read the run
- PASS the render completes (done)
- PASS exactly one `final` MP4 asset
- PASS private signed link with a download name
- PASS the MP4 downloads and starts with an `ftyp` box (size > 20 kB)
- PASS another account cannot sign the video
- PASS exactly one reservation for the double-clicked render (4/0.75 left)
- PASS the library lists the render with its video
- PASS a 12 s audio is refused by the broker BEFORE any GPU (AUDIO_TOO_LONG)
### cinema
- PASS anonymous: refused (401)
- PASS non-admin: refused (403) on GET and POST
- PASS admin: list answers 200
- PASS isolation: the disposable admin does not see the projects of the existing recipe accounts
- PASS project.create works (201)
- PASS scene.create works (201)
- PASS shot.create works (201)
- PASS storyboard read back: 1 scene, 1 shot
- PASS the non-admin cannot read it
### parallax
- PASS anonymous: /api/admin/modules refused (401)
- PASS public /api/modules: booleans only
- PASS non-admin: GET 403 and PATCH 403
- PASS admin: GET 200 with the five modules
- PASS Shorts disabled -> 404 even for a signed-in admin (guard before any job)
- FAIL admin: PATCH saves (app_settings exists and is writable)
- FAIL the public flag reflects it after a reload
- FAIL admin: PATCH back to disabled
- PASS the public flag is back to false

## Steps and cleanup
- Preview longcat: 14 chunks, project ids in the bundle: hhearpympdflxyfmszap
- Preview cinema: 14 chunks, project ids in the bundle: hhearpympdflxyfmszap
- Preview parallax: 14 chunks, project ids in the bundle: hhearpympdflxyfmszap
- cleanup ok: gate closed
- cleanup ok: test module flag emptied
- cleanup ok: rows and files of the disposable accounts
- cleanup ok: account c9d1e06a deleted
- cleanup ok: account cad9f676 deleted
- cleanup ok: temporary protection bypass revoked
- cleanup ok: Preview variable restored on feat/cinema-m1-persistence
- cleanup ok: Preview variable restored on codex/parallax-coexistence
- cleanup ok: disposable e-mail removed from the #125 Preview admin list
- cleanup ok: Previews rebuilt without the disposable e-mail

No residue found for the disposable accounts.

## Visual checks still to do (not covered by the API checks)
- [ ] Mobile (375 px) and tablet: Talking avatar page (/admin/studio/avatar): portrait grid, audio list with players, status area, video player and download button, no horizontal scroll.
- [ ] Desktop: choose a portrait and an audio, render, watch the status change, play the MP4, download it, reload the page and find the render in the Library.
- [ ] Cinema Studio screen (#119): storyboard, takes, montage panel on mobile and desktop.
- [ ] Parallax screens (#123): /admin/modules switches, navigation entries appearing and disappearing, Shorts / Audio / Remix pages, on mobile and desktop.
- [ ] Dark and light themes on each of those screens.
