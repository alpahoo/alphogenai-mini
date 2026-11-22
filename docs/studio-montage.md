# Studio montage with sound

Join finished video generations into one MP4, in the order chosen, with their sound. No GPU, no migration, no change to the H3/MOSS gates, budgets, reservations, licences or workflows. No new generation: the clips are only read.

## Use

History, "Montage": choose finished videos in the order you want (the badge shows the order), pick the sound (Corrected by default, or Original), optionally name it, "Make montage". The result appears under "Montages" in the history: Play, Download, Delete (with a confirmation). Deleting a montage never touches the generations it was made from, and deleting a generation never deletes a montage.

## Where it lives

A montage is one private file in the existing `comfy-outputs` bucket under `<user_id>/montages/<hex(name)>_<uuid>.mp4` (name encoded in the file name, like the reference library). No table. Playing and downloading use 10-minute signed links; the download name is built by the server. Limits: 2 to 10 clips, 25 MB per clip, 80 MB in total, 30 montages.

Route: `/api/admin/studio/montages` (admin only): `GET` list, `GET ?id=&download=1` signed link, `POST { run_ids, audio?, name? }`, `DELETE ?id=`. A clip must belong to the signed-in administrator, be finished, not deleted, a video, and have a file for the chosen sound; anything else is refused, naming its position, before any file is read.

## The method, and why

Tested on three real H3 clips (22/11/2026). A plain concatenation without re-encoding leaves the sound 49 ms later at every join (32 ms of AAC encoder delay and 17 ms of padding per clip): about three frames out of step at the third clip. The method that holds:

1. the video is copied as is (concat demuxer): no re-encoding, no quality loss, instant;
2. each clip's audio is cut to the exact length of its video (frames / frame rate from the frame table), given an 8 ms fade at both ends against clicks, joined, and encoded once as AAC at 192 kb/s;
3. the two are muxed.

| Method | Sound/picture offset at the cuts |
|---|---|
| Plain stream copy | +49 ms at each join (+98 ms at the third clip) |
| Full re-encode with the concat filter | +17 ms at each join |
| **This method** | **0.00, -0.01 and -0.02 ms** |

Run on the three real clips with the product code: 372 frames, 15.5007 s, picture and sound lengths equal in the container, 0.69 s, no click at the cuts.

Only ffmpeg's native AAC encoder is used (no libx264).

## Same format only

Joining without re-encoding needs identical video configuration (codec and its parameter sets, size, frame rate) and audio (codec, channels, sample rate). Clips of the same H3 workflow match (checked: the three real clips have byte-identical configuration). Otherwise the montage is refused with the reason and "needs re-encoding, which is not supported yet". A clip without audio, or a file that is not a complete MP4 (truncated), is refused too. Re-encoding different formats would need a Modal CPU function and its own authorisation.

## ffmpeg on the server

The `ffmpeg-static` package provides the binary (installed with `npm install`; kept external in `next.config.ts` and added to the route's serverless bundle). `FFMPEG_PATH` overrides it. A binary that lost its executable bit is copied to the temporary folder and made executable. If there is no usable ffmpeg the route answers 501 with a clear message and nothing is changed. Note for the owner: the `ffmpeg-static` builds are GPL; the binary is used on the server only and is not distributed.

## Not verified yet

Running on Vercel (binary size within the function limit, executable bit, 60 s limit): to be checked after deployment with the three real clips. This is a first version: no reordering after choosing (remove and choose again), no trimming, no transitions beyond the 8 ms fade.

## Checks

Vitest (full suite, including tests with a real ffmpeg when a binary is available), `tsc`, ESLint, `next build`. Real ffmpeg: order, 72 frames and the cut positions of three tone clips, with a control showing a plain copy misses the tolerance. Real Chromium with mocked APIs at 375, 768 and 1440 px: order of the choices, unavailable items disabled, request body, list, player, download link, delete with cancel then confirm, no horizontal overflow.
