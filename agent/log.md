Warning: truncated output (original token count: 75736)
Total output lines: 3479

## 2026-10-20 — Claude — Règle GRANT explicites Supabase (changement du 30/10/2026)
- Supabase n'accordera plus automatiquement l'accès Data API aux nouvelles tables `public` à partir du 30/10/2026
  (tables existantes non affectées). Vérifié sur le projet : default privileges encore actifs aujourd'hui.
- Ajouté la règle + un modèle de migration (CREATE TABLE + RLS + GRANT + policy) dans `CLAUDE.md`, et un rappel
  dans les garde-fous de `AGENTS.md` pour Codex. Docs uniquement, aucune migration ni changement DB.
- Prochaine étape : appliquer le modèle à la prochaine table créée et vérifier ses GRANT après application.

## 2026-07-31 — Claude — Creator UGC (T-1164d) corrected paid QA: visual+audio PASS, lip-sync gap
- After Codex's product-only hardening (`065f016`), the corrected 15s FR acceptance ran and produced a permanent
  MP4: job `5b64a9e4-a3e3-44c9-99e8-679ec9346d4b` (`Paulo` + verified identity `Moi_5`, refs = Powerbeats
  packshot+case only, no person). One generation, no retry.
- Did the visual review Codex couldn't (navigation-blocked): downloaded + probed + sampled frames (1/5/9/13s) +
  extracted audio. PASS on format (1080×1920, 15.07s, H.264 + real stereo audio), creator continuity (same
  person/wardrobe/office 1s↔13s), Powerbeats fidelity (black Powerbeats Pro + Beats logo faithful in the 9s
  close-up), and UGC structure (talking-head → product b-roll → thumbs-up). Owner confirmed the French audio is
  good (1-2 slightly slurred words, coherent).
- **BLOCKER = lip-sync**: mouth moves on the right timing but the visemes don't track French phonemes ("dubbing"
  effect). This is the BytePlus provider lip-sync (English-biased). The AlphoGen-owned native path (LatentSync,
  T-1163) is the fidelity fix → **T-1163e** (provider-neutral native compositor + fallback) is the priority lever
  for lip-sync quality, not just integration. MP4/frames kept local in `tmp/ugc-qa/` (gitignored).

## 2026-07-31 - Codex - Creator UGC paid QA stopped at BytePlus privacy preflight
- Prepared one authorized 15-second French Creator UGC acceptance for Powerbeats Pro 2 with reusable performance `Paulo`, verified identity `Moi_5`, an explicit first-person script and three official Beats references.
- BytePlus rejected the request before task creation with `InputImageSensitiveContentDetected.PrivacyInformation` on `content[3]`. The offending reference was the official lifestyle photo containing a real athlete; the verified creator identity was already supplied separately.
- No video task or output was created. The rejected preflight should not consume generation spend, and no automatic retry was performed.
- Hardened the contract: the studio now asks for product-only references with no people, and the route maps this provider privacy rejection to an actionable provider-neutral 422 message instead of a generic 502.
- Validation: focused UGC tests 20/20, TypeScript clean and production build successful. A corrected paid QA requires a new explicit GO and must use only the clean packshot and product-case references.

## 2026-07-30 - Codex - Open-AI-UGC contract adapted into Creator UGC Studio
- Audited `Anil-matcha/Open-AI-UGC` source under its MIT license. Its useful product mechanism is a free-form script plus up to seven ordered image references sent to one video model; Framer Motion animates its web UI and is not a video compositor.
- Adapted that contract without importing MUAPI, NextAuth, Prisma, Stripe, the upstream schema or its application shell. The AlphoGen admin experiment now accepts a creator script and up to six private product/scene references.
- Uploaded references remain in the private Supabase `references` bucket. The route accepts canonical own-user storage paths, signs them server-side, normalizes them to permanent R2 JPEGs and sends them with the verified BytePlus creator identity.
- Rebuilt the native prompt around one coherent influencer performance: the same creator must visibly wear, hold or use the exact product, interact with it on camera and deliver a natural recommendation. Detached voice-over montage, empty-handed creator shots and unrelated B-roll are explicitly rejected.
- Repositioned the directed Revideo path as a legacy comparison. Revideo is now optional post-production only after a native UGC output passes the product-quality gate.
- Validation: TypeScript clean, focused UGC tests 18/18 and production build successful. No provider call or paid generation was started.

## 2026-07-30 - Codex - T-1164c directed-edit final QA PASS
- Rebuilt the Powerbeats directed edit once through Revideo using the three cached Seedance 2.0 shots; no new provider generation and no additional paid video spend.
- Final request `2e415847-1c2d-412a-871d-a4a98dca8704` completed successfully and produced `https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev/videos/ugc-directed-edit/29802dff-2846-40fb-869e-097660904aaa/2e415847-1c2d-412a-871d-a4a98dca8704.mp4`.
- Technical QA PASS: 15.03 seconds, 1080x1920, H.264 Main at 30 fps with AAC stereo audio.
- Visual QA PASS at 1s/8s/14s: `Voici Powerbeats Pro 2.`, `Découvrez la nouvelle génération.`, then `Découvrez Powerbeats Pro 2.` with the `Découvrir` CTA. No dangling French connector remains.
- The final fix chain was `a5e9690` (dangling connector guard), `07df2c7` (elided apostrophe guard) and `643fa96` (sanitize already-compacted cached captions). The last fix addresses the actual production root cause.

## 2026-07-30 - Codex - T-1164c Revideo media localization
- The approved directed-edit rerun succeeded at the paid provider boundary: all three Seedance 2.0 shots completed and were copied to permanent R2 for job `29802dff-2846-40fb-869e-097660904aaa`.
- Revideo then failed before assembly because its Chromium renderer could not load the cross-origin R2 MP4 and MP3 sources (`MEDIA_ERR_SRC_NOT_SUPPORTED`), despite valid permanent URLs.
- Hardened the isolated Revideo worker to download each remote asset once, normalize short videos to local H.264/yuv420p without audio, normalize the voice-over to local 48 kHz stereo WAV, and expose those files through the renderer's same-origin Vite public directory. Per-request assets are size-bounded, time-bounded and always cleaned up.
- This recovery reuses the three completed paid shots. No provider regeneration or additional paid task is required.

## 2026-07-30 - Codex - T-1164c directed-edit privacy gate
- Started exactly one approved Powerbeats directed-edit QA with reusable presenter `Paulo` and verified identity `Moi_5`. The provider rejected the first creator shot before task creation because the request still included the raw real-person performance video alongside the approved verified identity. Reserved job: `4892834e-decf-4fae-afc1-947567175e5f`.
- Root cause: the directed storyboard correctly attached the verified identity, but the BytePlus adapter also forwarded `references.videos`; the provider privacy gate rejected that raw video as `InputVideoSensitiveContentDetected.PrivacyInformation`.
- Fixed the provider boundary so creator shots with verified asset IDs never transmit raw presenter videos. Product first-frame anchoring and the verified identity remain unchanged. Added a regression test covering both creator-facing shots.
- Validation: focused UGC tests 13/13, TypeScript clean and production build successful. No generation task was created by the rejected QA and no automatic retry was performed.

## 2026-07-30 - Codex - T-1164b capped Seedance 2.0 native Product Ad QA
- Deployed verified-identity routing for the native Product Ad experiment. The admin UI now selects one owned BytePlus verified creator identity and the server rejects unowned IDs; stale clients fall back to the latest owned verified identity instead of sending a raw real-person clip.
- Ran exactly one approved Seedance 2.0 native Product Ad task for Powerbeats Pro 2 with `Moi_5`, French, 9:16 and 15 seconds. Production job `ce13f059-408d-4a51-875d-fa097ea6a9f7` completed in 5m17s and was copied to permanent R2.
- Technical acceptance PASS: valid 1080x1920, 15.07-second deliverable; verified-identity path works; the creator is photorealistic; one worn-product close-up is coherent; no collage or poster-card renderer is present.
- Product acceptance FAIL: the model changes the Powerbeats product geometry and colors, the early face close-up is awkward, and the closing lineup has no benefit, price, offer or CTA. This is a useful native concept render, not yet a faithful shippable product ad.
- Decision: do not spend on repeated cosmetic native generations. Advance to the already-defined `directed_edit` path: three separately generated full-frame shots with stronger product-reference constraints, then deterministic Revideo assembly. Seedance 1.0 remains preview-only; Seedance 2.0 native remains a fast concept option until it passes the product-fidelity bar.

## 2026-07-30 - Codex - T-1164b Seedance 1.0 Pro Fast visual-preview QA
- Added and deployed an explicit free visual-preview mode using BytePlus `seedance-1-0-pro-fast-251015`, separate from the full Seedance 2.0 Product Ad contract. The preview uses one product image, 10 seconds, 9:16 and no presenter or audio.
- Production job `bef1bc1f-13bd-492e-90e9-87e360f4dd72` completed successfully and was copied to permanent R2. The MP4 is valid H.264, 704x1248, 24 fps, 10.04 seconds and intentionally has no audio.
- Product QA verdict: technically successful but not suitable for a faithful Powerbeats ad. Frame inspection at 1s/5s/9s showed invented branding, altered earbud geometry and a lifestyle shot that changed the product into a neckband headset.
- Decision: keep Seedance 1.0 Pro Fast only as a free motion/concept preview. Do not use it as the final product-fidelity renderer. The next meaningful validation is one capped Seedance 2.0 native Product Ad using the activated full model, subject to explicit spend approval.

## 2026-07-29 - Codex - T-1164b native multi-shot Product Ad path
- Corrected the architecture after reviewing Open-AI-UGC more closely: Framer Motion animates the studio interface but does not edit or export video. A provider-native complete ad therefore does not need Revideo when its output already meets the product bar.
- Added a separate provider-neutral `UGCNativeAdProvider` contract and a Seedance/BytePlus implementation using one 15-second task, explicit timed three-beat direction, product/presenter references and synchronized native audio.
- Added an admin-only DB-first start/poll route. Completed output is copied to permanent R2 and written to the normal AlphoGen job result; provider names and task ids are not returned.
- Kept the existing `directed_edit` three-shot/Revideo path unchanged for deterministic voice, captions, branding and timing. ComfyUI remains deferred.
- Validation: 9 focused tests, TypeScript and production build pass. No provider call, GPU work or paid generation was started.

## 2026-07-29 - Codex - T-1164a provider-neutral UGC shot pipeline
- Stopped further investment in the rejected `three-shot-v2` poster compositor and audited Open-AI-UGC for reusable architecture. Retained only the asynchronous provider-routing concept; no auth, Stripe, Prisma, MUAPI or application shell was imported.
- Added the `UGCShotProvider` contract, a Seedance/BytePlus adapter and a strict three-shot storyboard for creator hook, product demo and lifestyle CTA. Prompts prohibit collage, floating cutouts and generated copy while preserving product references.
- Fixed the existing BytePlus multimodal request path so verified face assets no longer discard safe product references, and video/audio references are forwarded.
- Added an admin-only DB-first experiment route that persists every paid task immediately and promotes completed clips to permanent R2 objects.
- Added an isolated Revideo worker and Linux Docker target for Hostinger orchestration. It edits three full-screen clips and contains no provider credentials.
- Validation: six focused tests, root TypeScript, worker TypeScript and production build pass. The local Windows Revideo runtime timed out and is not claimed as a render PASS; the Node 22 Linux/Hostinger smoke plus one capped Beats acceptance remain.

## 2026-07-27 - Codex - T-1163e V2 editorial rebuild after production QA FAIL
- The owner rejected production job `7306087a-85f8-47d4-a0fb-7e8913d6e0d1` on product quality. The file was technically valid, but it was a voice-over on a boxed presenter, with a generic voice, one awkward product card and a full static sentence. The earlier PASS label below was incorrect; the result is now recorded as a product QA FAIL.
- V2 replaces that poster with a deterministic three-shot edit: preserved product hero, dominant animated presenter with a restrained product picture-in-picture and two timed caption beats, then a product CTA close.
- Product extraction now collects up to four deduplicated images from Open Graph, Product JSON-LD and bounded page images instead of relying on one `og:image`.
- The native path now exposes four curated product voice profiles. The selected allow-listed voice is used by multilingual TTS instead of being ignored; only its product label is persisted.
- Validation is intentionally bounded: four focused tests, TypeScript, Python AST, production build and one local synthetic ffmpeg graph smoke pass. No provider/GPU call or paid generation was started.

## 2026-07-27 - Codex - T-1163e production technical completion + rejected visual
- Production job `7306087a-85f8-47d4-a0fb-7e8913d6e0d1` completed through `native_product_ad` with a permanent R2 output, no public error and no new provider generation during inspection.
- Downloaded and probed the exact output: 720x1280 portrait H.264 plus mono AAC, 6.52 seconds. Three-frame inspection confirmed the retained private presenter is animated inside an AlphoGen-composed product ad with Powerbeats media, spoken audio, captions and branding.
- Found one visual defect in the first production output: a two-line product title could overflow the white product card and overlap the presenter panel. The compositor now reserves title height before sizing the product image, keeping every title line inside the card.
- The native duration control now says `Up to 8s native` and explains that output length follows generated speech, matching the real 6.52-second result instead of promising an exact 8.00 seconds.
- Python syntax, TypeScript, diff-check and production build pass. The polish requires the normal Vercel + Modal deploy but no migration and no paid generation.

## 2026-07-27 - Codex - T-1163e native Product Ad compositor code-ready
- Connected the validated private native presenter primitive to the real Product Ad workflow without replacing the existing path. A ready reusable performance clip now selects a distinct `native_product_ad` job route and an honest eight-second beta contract.
- Jobs are reserved before TTS or GPU work. Product-page metadata and one bounded spoken line are persisted, audio is deduplicated through the own-only animation cache, interrupted private audio uploads are repaired, and result-page polling advances animation state idempotently.
- Added a provider-neutral Modal CPU compositor that resolves private media server-side, prefers the completed native animation, falls back to the normalized performance clip, and produces product media, captions, branding and portrait/square/landscape output.
- UI and public engine labels expose only AlphoGen product concepts. No provider/model/task id, signed input or storage path is returned. The existing Product Ad provider path is untouched.
- No new migration is required; the owner already applied the T-1163d animation schema. TypeScript, focused tests, Python syntax and production build pass. Deployment and one authenticated eight-second production acceptance remain.

## 2026-07-27 - Codex - T-1163d production deployment and private GPU QA PASS
- The owner applied migration `20260727_create_native_presenter_animations.sql` to AlphoGen production.
- Fixed the Modal deployment workflow after the isolated LatentSync app failed to import `pydantic`; commit `544e3ff` installs the required deployment dependency and makes workflow changes trigger deployment.
- Both Modal apps deployed successfully. The LatentSync health endpoint returned `provider-neutral ok` state, and its private native start endpoint rejected missing authorization with `401`.
- Hardened the polling web image with `requests` in commit `5f20c6b`, so remote download failures can be serialized and returned through the status endpoint instead of breaking polling.
- Ran one capped private A10G acceptance using a temporary normalized base and an existing owned 3.192-second podcast speech segment. Final successful GPU elapsed time was 113.29 seconds.
- Output validation passed: private 3.24-second MP4, 512x512 H.264 video plus AAC audio. A three-frame visual sample showed distinct mouth positions while identity, body and studio remained stable.
- The first harness attempt started no GPU because the pulled production URL was redacted. One subsequent call failed before inference because the temporary QA harness reconstructed a raw Supabase signed URL without `/storage/v1`; the production SDK path was not affected. The final corrected call completed.
- Temporary database rows and private Storage objects were deleted. Sensitive local environment, harness and temporary ffmpeg files were also removed; only the final local video and visual QA captures are retained for owner review.
- T-1163d is complete. T-1163e is the next slice: integrate the native animated presenter into the AlphoGen-owned Product Ad compositor with provider-neutral routing and fallback.

## 2026-07-27 - Codex - T-1163d native speech animation adapter code-ready
- Added the private, provider-neutral `base + speech -> animated presenter` primitive. The schema reserves own-only audio/output storage and an idempotent cache keyed by user, normalized base, audio SHA-256 and adapter version.
- Added authenticated prepare/upload/submit/poll/download/remove operations. Work is claimed before GPU launch; processing rows are reused; a launched task whose id cannot be saved becomes `needs_review` and cannot be retried or deleted blindly.
- Extended the isolated LatentSync Modal app with private native endpoints. Signed inputs are downloaded before model bootstrap, output paths must match `{user_uuid}/{animation_uuid}/animated.mp4`, and generated video writes directly to private Supabase Storage.
- Output path and duration are verified before `ready`. Public API state contains no model/provider/task id, private path, signed input or raw infrastructure error; download URLs are explicit and expire after ten minutes.
- Validation: 16 focused tests, 1052/1052 full Vitest tests, TypeScript, Python syntax and production build pass. The local Python runtime lacks pytest/modal, so the extended Python HTTP/path contract test remains for CI.
- Migration `20260727_create_native_presenter_animations.sql`, Modal deployment and one capped private GPU QA remain explicit gates. No GPU, provider or paid generation was started.

## 2026-07-27 - Codex - T-1163c private normalization production PASS
- With no retained native base available in production, created one temporary private QA base under the admin account using a small local MP4. No provider, model or GPU generation was invoked.
- Ran the deployed Modal CPU normalizer once. Supabase moved the base to `ready` with no error: 6.443 seconds, 720x720, 25 fps, `square-720p25-silent-v1`.
- Downloaded the normalized object through authenticated private Storage access and confirmed a valid MP4 signature and 1,353,084-byte payload. Public APIs continued to expose no storage path.
- Removed both private Storage objects, the temporary database row and the local QA copy. Verification found zero remaining rows for the QA base.
- T-1163c is complete. Next slice is T-1163d, the provider-neutral native speech-animation adapter with LatentSync first.

## 2026-07-27 - Codex - T-1163c production deployment
- Production migration `20260726_native_presenter_normalization.sql` was applied by the owner.
- Commit `f033fab` was pushed to `origin/main`; the Modal deployment workflow completed successfully and Vercel reported `success`.
- Production protection checks passed without credentials: `GET /api/presenters/video` returned `401`, and `GET /api/cron/native-presenter-retention` returned `401`.
- No GPU, model, external provider, or paid generation was called during deployment verification. One authenticated private retained-clip normalization remains the final acceptance QA.

## 2026-07-26 - Codex - T-1163c native Video Presenter private normalization
- Added an asynchronous, idempotent CPU normalization stage for retained performance footage. Next.js claims the private base only after the manual presenter request is queued, then triggers a secret-protected Modal webhook; retry reuses `normalizing`/`ready` state.
- Modal downloads the source from private Supabase Storage, center-crops to 720x720 at 25 fps, strips the original sound, adds silent stereo AAC, caps at 30 seconds, validates with ffprobe, and writes a separate private normalized asset before marking the base ready.
- No storage path, provider name, raw error or signed URL crosses the public presenter API. The UI exposes only preparing/ready/retry product states.
- Source and normalized copies are removed together. Retention protects recent normalization jobs but treats jobs stale for more than two hours as removable so failed infrastructure cannot retain footage indefinitely.
- The new webhook and Next client fail closed when `MODAL_WEBHOOK_SECRET` is absent. No GPU/model/provider call or paid generation is part of this slice.
- Validation: 17 focused tests, 1036/1036 full tests, TypeScript, Python AST parse and production build pass. Migration `20260726_native_presenter_normalization.sql` was subsequently applied before deployment.

## 2026-07-26 - Codex - T-1163b native Video Presenter base lifecycle
- Added an optional retention consent separate from the current one-time presenter-processing authorization. The default remains no retention.
- Opt-in uploads a second copy of the performance footage directly to a dedicated private bucket, avoiding Vercel body limits and keeping manual cleanup independent from the native asset.
- Added `user_presenter_native_bases` with own-only RLS, one-year retention, explicit removal state, a user deletion action and a daily fail-closed retention cron. No GPU/model/provider call is started.
- Updated the privacy policy and native-track specification. Migration is intentionally required before deployment because `/api/presenters/video` reads the new table.
- Validation: 1030/1030 tests, production build and TypeScript pass. No paid call.

## 2026-07-26 - Codex - T-1163a manual-assisted Video Presenter publication
- Replaced browser calibration as the immediate production dependency with an admin-assisted, provider-neutral linking path.
- `/admin/video-presenters` now accepts a completed account presenter ID only for stopped/review states. The server verifies that it exists in the completed account catalog before publishing it for the request owner.
- Publication is idempotent by user + external avatar ID, stores a private normalized cover, preserves timestamped consent, uses an optimistic request-status update, and only then removes source/consent footage. Cleanup failure remains independently recoverable.
- Updated the High-fidelity Video Presenter spec and Product Ads Decision Book. The native LatentSync path is explicitly separate because it needs retention consent and an AlphoGen-owned Product Ad compositor; existing one-time footage is not retained implicitly.
- Validation: 16 focused tests and TypeScript pass. No provider generation, paid call or schema change.

## 2026-07-26 - Codex - T-1162 Product Ad operational hardening
- Added an admin-only Video Presenter queue with status filtering, attempts, media sizes, neutral error codes and recovery guidance.
- Added a pure retry policy and server enforcement: no retry of active claims, 30-minute stale-claim threshold, six-hour ambiguous-submission lock, three-attempt ceiling, and explicit confirmation for operations that may spend.
- Added safe private-footage cleanup and request removal. Active provider operations cannot be removed; raw provider details and storage paths never leave the admin API.
- Added the Product Ads V1 Decision Book and Hostinger VPS operations guide. The workflow is not falsely marked frozen: one live form calibration and one capped end-to-end request remain.
- Validation: 18 focused tests, TypeScript, production build and diff-check pass. No migration, provider call or credit spend. The existing uncommitted calibration changes in `workers/jogg_avatar/jogg_avatar_worker.py` and `login.py` were preserved.

## 2026-07-19 - Codex - High-fidelity Video Presenter bridge deployed
- Implemented the agreed white-label alternative to the unaffordable Enterprise API: AlphoGen collects named performance footage, a separate consent clip, and an explicit likeness authorization; both videos upload directly to a private Supabase bucket with signed tokens.
- Added a provider-neutral asynchronous request API and Product Ad UI. Pending video presenters appear as Training/Review cards and completed presenters are refreshed into the existing reusable account catalog automatically. The existing AI portrait path remains available and unchanged.
- Added a private one-at-a-time Playwright worker. It uses only the normal provider web UI with a persistent user-owned session, never bypasses captcha or uses private endpoints, stops on UI drift with screenshots, detects completion through the documented custom-avatar catalog, creates a ready `user_presenters` row, and deletes sensitive source/consent footage after successful publication.
- Applied `20260719_create_user_video_presenter_requests.sql` to the AlphoGen production project and independently verified the queue table, private `user-video-presenters` bucket, four queue RLS policies, and three storage policies.
- Pushed commit `a6b403c` to `origin/main`; Vercel now serves `/api/presenters/video`, which correctly returns `401 Unauthorized` without a session.
- Remaining gate: run worker `login` and read-only `inspect` once to calibrate the real Custom Avatar UI before any submission. No provider submission or paid generation was run. Validation: 22 focused tests, tsc, Python compile, production build, diff-check.

## 2026-07-19 - Codex - Product Ad bilingual custom voice
- Added the account custom-voice catalog to Product Ad through Jogg's private `/v2/voices/custom` endpoint. Duplicate clones are collapsed by normalized name with the newest provider entry retained, so `gvnahid292` is resolved dynamically instead of hardcoding a transient API voice id.
- Added an explicit Product Ad language selector for French (France) and English. Custom voices with no provider language metadata are treated as multilingual and remain selectable in both languages; public voices are filtered to the chosen language.
- Kept avatar, voice, and script language as independent provider inputs. The same custom voice can therefore be paired with a completed custom video avatar, completed photo avatar, or compatible public avatar. Validation: 38/38 focused tests, `npx tsc --noEmit`, production build, and diff-check pass. No paid generation was run.

## 2026-07-19 - Codex - Product Ad avatar fidelity and format contract
- Confirmed from the provider contract that Photo Avatar deliberately generates AI portrait variants before motion; it is an inspired likeness, not an identity-preserving animation of the uploaded pixels. Product copy now distinguishes these `AI look` portraits from recorded `Video` presenters, which offer the closest likeness.
- Fixed the account-avatar format contract: custom and photo avatars now retain the provider-declared aspect ratio instead of being forced to portrait. Missing ratios remain unknown so users are not incorrectly blocked from square or landscape output; changing format only deselects a presenter when a known ratio is incompatible.
- Added regression coverage for dashboard-created custom video avatar `445593` (`aspect_ratio: 1` -> landscape) and unknown ratios. Validation: 26/26 focused tests, `npx tsc --noEmit`, and production build pass. No provider generation or paid call was run.

## 2026-07-19 - Codex - Product Ad presenter workflow correction
- Re-read the official provider contracts after production account-presenter cards remained in `processing`. The prior implementation incorrectly called motion directly on an uploaded portrait; the documented photo flow is now staged as portrait upload -> photo generation -> photo status -> motion -> motion status.
- Provider stage state is persisted in the existing task column, including the selected voice. No migration is required. A ten-minute per-stage server timeout and bounded client polling prevent permanent spinners, while background polling resumes recent work after a page reload.
- Existing dashboard-created custom video avatars remain a separate supported path. Account avatar `445593` is sent as custom `avatar_type: 1`; it does not pass through the photo-generation workflow.
- Added the provider-required Woman/Man presentation choice to the upload modal. Validation: 986/986 Vitest tests, `npx tsc --noEmit`, production build, and focused tests for photo/motion transitions, timeout, legacy task compatibility, and custom avatar `445593`.

## 2026-07-18 - Codex - Product Ad presenter/upload regression fix
- Diagnosed the production Product Ad submit failure from Vercel logs: provider code `18022` reported that the selected portrait presenter did not match the requested landscape aspect ratio. Automatic mode now chooses a format-compatible public presenter; selecting a catalog or account presenter synchronizes its format, and changing to an incompatible format safely falls back to Automatic.
- Presenter photos are now decoded, validated, center-cropped to a predictable 9:16 JPEG, and compressed below Vercel's request-body ceiling in the browser before upload. The API guard and its message now correctly enforce 4 MB for direct callers.
- Failed account presenter cards are no longer inert: they expose an explicit Retry action. New provider failures retain a product-safe reason (`insufficient_credits`, `feature_unavailable`, `invalid_portrait`, or generic) and surface useful copy without exposing provider identity.
- Product Ad submit now displays the server's actionable format error instead of replacing every failure with a generic message. Validation: 29/29 targeted tests, `npx tsc --noEmit`, production build, and diff-check pass. No paid provider action was run.

## 2026-07-18 - Codex - Product Ad account-owned presenters
- Implemented the missing user-likeness path for Product Ad. A signed-in user can upload a JPG/PNG/WEBP portrait, provide explicit likeness consent, and create a reusable animated presenter instead of being limited to the provider catalog.
- Portraits are magic-byte validated, require at least 512x512 pixels, normalized to private JPEG storage, SHA-256 deduplicated, and exposed only through signed URLs. The product API resolves presenter ownership server-side and never trusts a client-supplied external avatar id.
- Presenter creation is a separate, explicit paid action. The row is claimed before the provider call, asynchronous task ids are retained even when the final avatar id arrives later, completed presenters are reused, and inconsistent processing state never triggers an automatic second spend.
- Applied `20260718_create_user_presenters.sql` to the production AlphoGen Supabase project; the editor returned `Success. No rows returned`. No paid provider call was made.
- Validation: 23/23 targeted Vitest tests, `npx tsc --noEmit`, and `npm run build` pass. New routes: `/api/presenters`, `/upload`, `/[id]/generate`, `/[id]/status`.

## 2026-07-17 - Codex - URL-to-Video/VEED review follow-up
- Restored the historical Jogg cron response contract: write failures are again exposed as `errors`, while the internal settle outcome remains `error`. Added a regression test for the serialized shape.
- Hardened the frozen VEED web worker after review: final `done` persistence is retried; if it still fails after a successful paid generation and R2 upload, the worker stores `veed_output_ready` with the durable R2 URL instead of marking the job failed. The next worker pass promotes that output to `done` without reopening VEED or spending again. If the database is completely unavailable, an ignored local recovery manifest preserves the output coordinates and is replayed automatically when the worker resumes.
- Recovery promotion now runs before Playwright starts, so a durable R2 output is finalized without opening VEED again; persistent DB failures back off for 60 seconds in loop mode.
- Validation: 954/954 Vitest tests, 6 Python persistence tests, Python compile, TypeScript, production build, and diff-check pass. No provider generation or paid call was made.

## 2026-07-13 - Codex - T-1156 60-second cache-resume production PASS
- Resumed the existing English 60-second casual podcast (`847955bc`) that had previously stopped at 5/8 clips because of the 4.26-second presenter contract. The v2 run reused all 5 cached clips and generated only the 3 missing clips: 8 selected, 5 cached, 3 started, 0 skipped, 0 failed.
- The three Balanced clips completed in about 4.7 minutes and the final compositing render reached `done` with 8 segments. This validates the requested one-minute upper bound and proves incremental cache reuse avoids re-spend.
- T-1156 observation is closed with two end-to-end cases (30s French expert and 60s English casual). A third paid run would add little signal, so it was deliberately not launched.

## 2026-07-13 - Codex - T-1156 short Balanced podcast production PASS
- Re-ran the previously blocked French expert podcast (`fd67bd3c`) after deploying the 8.6-second presenter clips. All 8 dialogue segments started, none were skipped, and all 8 completed on Balanced with zero failed clips or provider fallback.
- The two-worker queue completed in about 9.7 minutes; the final free compositing render reached `done` after 9 polls and produced a durable R2 MP4 with 8 segments. This validates the complete 30-second path while keeping the observation policy capped at 60-second podcasts.
- The in-app browser blocked direct R2 playback, so this pass validates API state, cache completion, and the final render artifact rather than adding a redundant visual-frame review; talking-duo compositing was already visually qualified in T-1144/T-1154.

## 2026-07-13 - Codex - T-1156a base-v2 presenter clips production PASS
- Generated the four cache-isolated `base-v2-8s` catalog presenter clips through the staged admin route, under the approved EUR 5 ceiling and without retrying failed provider jobs.
- Maya 8.80s, Leo 8.62s, Aria 8.62s, and Nova 8.62s all reached `ready` and were copied to durable R2 URLs. The first dry run stopped before provider generation because a historical persona id was stale; resolving active personas by name fixed the operation with zero wasted provider spend.
- The 30-60 second observation can now resume against dialogue turns up to roughly 9.9 seconds (base duration plus the existing 15% tolerance).

## 2026-07-12 - Codex - T-1156a 60-second observation unblocker
- Diagnosed the observation stop as a base-clip contract issue, not a podcast-duration or provider-cap issue: the existing 4.26-second `base-v1` presenter clips reject longer dialogue turns before any lip-sync job starts.
- Introduced cache-isolated `base-v2-8s` presenter clips with a longer neutral script, switched the lip-sync resolver to v2, persisted the selected quality before generation, and surfaced skipped reasons instead of silently completing.
- Validation: 25/25 targeted tests, 950/950 full tests, tsc, and production build pass. No provider job or paid generation was started in this change.

## 2026-07-12 - Codex - T-1155 Controlled Balanced beta production QA PASS
- Deployed commit `a9ff295`, enabled the production server flag, and verified the controlled beta in the signed-in admin account without starting any provider job or spending credits.
- Balanced renders as an enabled `Beta` quality target with a conservative queue ETA, two-at-a-time disclosure, and automatic Premium fallback copy. The UI exposes no provider names. Switching back to Premium restores the validated production copy and leaves generation enabled.
- The server-side cohort gate remains authoritative: non-eligible direct API requests are covered by tests and fail closed to Premium. Production deployment `dpl_E2aRZGa1ndF84NaCgCzJGLK86Yx3` is READY and aliased to `www.alphogen.com`.

## 2026-07-12 - Codex - T-1155 Controlled Balanced beta implementation
- Added a server-enforced cohort gate: Balanced requires the global server flag plus an admin account or a Premium account on the private email allowlist. Direct API requests outside the cohort fail closed to the validated Premium route.
- Added provider-neutral `/api/podcasts/quality-access` capability discovery and a Beta-only Studio control with conservative queue ETA, two-at-a-time disclosure, automatic Premium fallback copy, and an extended polling budget for queued GPU work.
- Validation: 950/950 full tests, 245 podcast/API tests, 32 targeted tests, production build, and tsc all pass. No migration, Modal change, or provider spend.

## 2026-07-12 - Codex - T-1154 Balanced internal mini-batch PASS
- Ran a production-only three-clip LatentSync batch on the QA podcast while the public Balanced control remained locked. Result: 3/3 ready, zero fallback, zero failure, two A10G workers maximum, and the third task queued as designed.
- Structured metrics: 13.80s output, 481.93s cumulative GPU time, per-clip latency 123.72-220.32s. Provider-aware estimates stored $0.05-$0.06 per clip ($0.17 total), instead of the former HeyGen estimate.
- Human frame/motion review passed on both personas: stable identity, visible mouth movement, stable studio framing. One duplicated completion log was observed from overlapping UI polls; it caused no duplicate provider spend and only rewrote the same durable R2 key.
- Restored QA podcast metadata to `{}`, reset `PODCAST_LATENTSYNC_BALANCED_ENABLED=false`, and redeployed Vercel production. Decision: internal beta gate passed; public Balanced remains locked until queue/ETA UX and controlled cohort monitoring exist.

## 2026-07-12 - Codex - T-1154 Balanced production hardening (pre-QA)
- Added provider capability contracts (max input, concurrency, measured cost) and provider-aware estimates. Balanced no longer reports HeyGen pricing; the production cap reserves worst-case HeyGen fallback cost before any GPU task starts.
- Segments outside LatentSync's 8-second input contract route directly to HeyGen before cache reservation/GPU spend. Modal A10G concurrency is explicitly bounded to two containers.
- LatentSync completion telemetry now crosses the neutral provider contract and is emitted as structured completion metrics. Public Balanced remains disabled pending the capped internal mini-batch.
- Validation: 943/943 tests, 45 targeted provider/route tests, 2 Python contract tests, py_compile, tsc, and production build all pass. No migration or public UI change.

## 2026-07-12 - Codex - T-1153 same-input LatentSync vs HeyGen comparison
- Generated a provider-controlled comparison for the exact same podcast segment, persona, base clip, and TTS audio. The existing LatentSync cache was temporarily hidden, one HeyGen precision clip was generated (~$0.13), then both provider rows were restored as ready and the podcast metadata was returned to its original state.
- LatentSync: 3.36s, 512x512 H.264 + 16kHz mono AAC, ~176s cold end-to-end. HeyGen: 3.32s, 720x720 H.264 + 48kHz stereo AAC, ~99s end-to-end. Frame inspection shows both preserve the persona and studio framing; HeyGen remains sharper and slightly more stable around the mouth/lower face.
- Decision: keep HeyGen as the public Premium production route. LatentSync remains disabled publicly but is now the validated leading Balanced candidate: close visual quality, materially lower measured cost, slower cold latency. No provider switch or batch generation was performed.
- Local review artifacts: `C:\tmp\t1153-latentsync-vs-heygen.mp4` and `C:\tmp\t1153-latentsync-vs-heygen.jpg` (not committed).

## 2026-07-12 - Codex - T-1153 Balanced LatentSync production gate
- Ran a one-segment, feature-flagged production gate on podcast `307e628c-96a0-4ad6-b948-60a2f57c2f9a`; public Balanced UI remained locked and only the QA podcast metadata was temporarily overridden.
- Found and fixed a real HTTP-contract bug: the local Pydantic request model combined with postponed annotations made FastAPI expose `req` as a query parameter, so `/start` returned 422 and correctly fell back to HeyGen. The request model now lives at module scope and an OpenAPI contract test asserts a JSON request body with no `req` query parameter.
- Redeployed `alphogenai-latentsync` and re-ran one clean segment. It completed with provider `latentsync_modal`, no fallback, a durable R2 cache URL, and a valid 3.36s 512x512 H.264 + AAC output. Visual frame inspection passed.
- Restored the QA podcast metadata, set `PODCAST_LATENTSYNC_BALANCED_ENABLED=false`, and redeployed Vercel production. Balanced remains internal/locked pending broader human comparison; no batch was run.

## 2026-07-12 - Codex - T-1151 LatentSync multi-sample qualification
- Ran three additional capped Modal A10 samples across Aria/Leo and 2.02-4.56s inputs. All produced valid 512x512 H.264+AAC outputs; aggregate LatentSync evidence is now 4 technical passes / 14.56s output / 581.32s GPU wall time.
- Fixed the isolated spike harness so checkpoint symlinks are recreated in every ephemeral Modal container while model downloads remain volume-cached.
- Estimated new-session GPU spend including one failed bootstrap was ~$0.142, below the approved $0.30 ceiling. Frame QA passed; only one clip has moving human review, so LatentSync remains medium-confidence watchlist and is not production-routed.

## 2026-07-12 - Codex - T-1150 measured lip-sync provider matrix
- Replaced theory-only promotion with evidence-gated scoring: production candidates now require a technical pass, a human visual pass, measured metrics, and at least three same-input samples.
- Encoded the measured matrix: current SaaS baseline 82/high/production; LatentSync Modal A10 62/medium/watchlist; MuseTalk 28/low/reject. LatentSync is roughly 3x cheaper per measured output-second but slower and supported by one reviewed sample.
- Added long-form directional cost projections and the internal routing decision report. No provider switch, UI change, migration, Modal run, or credit spend.

## 2026-07-11 - Codex - T-1148b premium quality target UI
- Added a provider-neutral Quality target card inside /create/podcast when Lip-sync premium is selected. Economy, Balanced, Premium, and Cinema are visible as product modes; only Premium is currently selectable, while planned modes remain locked until benchmark/cost gates pass.
- Persisted `lipsync_quality_mode` in podcast metadata through POST/PATCH and restored it on reopen. This is treated as a studio preference and does not invalidate existing renders while the effective production route remains unchanged.
- Scope: no provider switch, no Modal change, no migration, no credit spend. Validation: routing + podcast route tests 40/40, tsc clean, production build OK.

## 2026-07-11 - Codex - T-1148 provider router quality modes
- Added a provider-neutral lip-sync routing layer with product-facing quality modes: Economy, Balanced, Premium, and Cinema. Public labels/descriptions intentionally do not expose provider names.
- Routed the existing premium lip-sync endpoint through the new resolver while preserving current production behavior: Premium -> current baseline provider in precision mode. Planned modes fall back to Premium unless explicitly enabled for internal benchmark work.
- Scope: no UI change, no provider switch, no Modal change, no migration, no credit spend. Validation: targeted routing/provider tests 11/11, tsc clean, production build OK.

## 2026-07-09 - Codex - T-1147e1 Modal GPU one-clip spike harness
- Added `modal_app/self_hosted_lipsync_spike.py`: an isolated Modal app for an operator-run MuseTalk one-clip GPU spike. It is not imported by production, has no UI, no route, and spends no GPU time unless manually invoked with `modal run`.
- The harness downloads one base clip and one AlphoGen TTS segment, trims them to a small cap, runs MuseTalk on A10G, uploads the output MP4 to R2, and returns probes/timing/output URL for comparison against the HeyGen one-segment gate.
- Updated the self-hosted feasibility spec with the run command, acceptance criteria, and stop conditions. Validation: Python syntax compile only; no Modal deploy/run, no GPU spend, no provider switch.
## 2026-07-09 - Codex - T-1149e premium Jogg-like UX polish
- Improved `/create/podcast` premium render UX with a clearer 3-step Jogg-like path: voices -> talking clips -> final render, plus a progress bar and synced percentage.
- Surfaced the max estimated cost for missing premium clips and moved the explicit "Generate missing clips" action into the premium readiness card, while keeping generation user-triggered.
- Added cache/no-re-spend reassurance before final premium render. Scope: UI-only; no API, Modal, DB, provider call, or credit spend. Validation: tsc clean and production build OK.
## 2026-07-09 - Codex - T-1147e self-hosted lip-sync feasibility spec
- Added `docs/product/podcast-self-hosted-lipsync-feasibility.md`: a no-spend feasibility plan for testing open-source/self-hosted lip-sync as the next cost-reduction path after the proven HeyGen baseline.
- The spec defines candidate families, the exact drop-in output contract, acceptance gates (quality/cost/latency/license/cache/fallback), and recommends a Modal GPU one-clip spike before any product integration.
- Scope: docs/spec only; no provider call, no GPU run, no UI, no route, no Modal deploy, no credit spend.
## 2026-07-09 - Codex - T-1149d premium render verification hardening
- Hardened `POST /api/podcasts/[id]/render`: if the premium lip-sync cache verification query fails, the API now returns 500 and never marks the podcast as rendering or triggers Modal.
- This keeps the premium path fail-closed while distinguishing an infrastructure verification issue from genuinely missing lip-sync clips.
- Scope: API guard only; no Modal, DB, provider call, or credit spend. Validation: render/lipsync route tests 23/23, production build OK, tsc clean after build.
## 2026-07-08 - Codex - T-1149c backend premium render guard
- Hardened `POST /api/podcasts/[id]/render`: when `metadata.render_mode` is `lipsync_premium`, the API now requires every ready segment to have a ready lip-sync clip for its current `audio_url` before marking the podcast as rendering.
- Direct API calls can no longer bypass the UI premium checklist; missing/processing/failed/stale-audio premium clips return 400 and never trigger Modal.
- Scope: API guard only; no Modal, DB, provider call, or credit spend. Validation: render/lipsync route tests 22/22, tsc clean, production build OK.
## 2026-07-08 - Codex - T-1149b fresh premium render gate
- Hardened the /create/podcast premium render guard so the final Render action uses the freshly fetched `/lipsync` snapshot instead of potentially stale React state.
- If the refresh succeeds, render is blocked from the fresh per-segment statuses (`missing`, `failed`, `processing`, `needs_voice`); if refresh fails, it falls back to the existing UI-derived guard.
- Scope: UI-only; no API, Modal, DB, provider call, or credit spend. Validation: tsc clean and production build OK.
## 2026-07-08 - Codex - T-1149 podcast premium UX hardening
- Hardened /create/podcast premium render UX: premium render no longer auto-starts paid lip-sync generation; users must generate missing premium clips explicitly before final render.
- Added a premium readiness checklist (voices, lip-sync clips, final render) and clearer render copy/button state for lipsync_premium.
- Scope: UI-only; no API, Modal, DB, provider call, or credit spend. Validation: tsc clean and production build OK.
## 2026-07-08 - Codex - T-1147d provider comparison report
- Added docs/product/podcast-lipsync-provider-comparison-report.md. Recommendation: keep HeyGen as the current production baseline; do not switch provider without a measured drop-in replacement.
- Screened Descript, Google/Veo/Flow, OpenAI video, BytePlus media, and self-hosted lip-sync against the exact AlphoGen contract: base clip + our TTS audio -> downloadable MP4 segment clip -> copied to R2.
- Next recommended slice: self-hosted/open-source lip-sync feasibility spike, because it is the most plausible cost-reduction path after HeyGen.

## 2026-07-08 - Codex - T-1147c admin lip-sync benchmark harness
- Added admin-gated `POST /api/admin/experiments/podcast-lipsync-benchmark` with `start`, `poll`, and `score` actions. `start` runs exactly one provider clip under a hard spend cap; `poll` copies completed provider output to R2; `score` uses the pure T-1147a scoring helper.
- The harness is experimental/admin-only, stores no product DB rows, has no UI, and does not spend unless an admin explicitly calls `action:"start"` with valid URLs and cap.
- Validation: targeted tests, full suite, build, and tsc green.

## 2026-07-08 - Codex - T-1147b provider adapter around HeyGen
- Added lib/podcast/lipsync-provider.ts with the provider-neutral `PodcastLipsyncProvider` interface and a HeyGen adapter wrapping the existing `createLipsync` / `getLipsyncTask` calls.
- Refactored `/api/podcasts/[id]/lipsync` to use `getPodcastLipsyncProvider("heygen")` for create/poll while preserving existing cache rows, caps, cleanup, fallback, and provider id.
- Added adapter unit tests and kept the existing lipsync route tests green. Scope: no UI, no Modal, no provider switch, no paid provider calls.

## 2026-07-07 - Codex - T-1147a provider benchmark framework
- Added docs/product/podcast-lipsync-provider-benchmark-spec.md to define provider-neutral benchmark gates, candidate notes, sequence T-1147a-e, and the rules for replacing HeyGen only after measured quality/cost/latency evidence.
- Added lib/podcast/lipsync-provider-benchmark.ts with a pure scoring helper and HeyGen baseline data. The score weighs quality, cost, latency, API/cache/consent fit, and integration effort.
- Added lib/podcast/__tests__/lipsync-provider-benchmark.test.ts covering baseline scoring, cheaper candidates, reject gates, integration penalty, and sorted comparisons.
- Scope: no UI, no route, no Modal, no provider call, no credit spend. Next recommended slice: T-1147b adapter interface around the existing HeyGen calls.

## 2026-07-07 - Codex - T-1146 auto cleanup after premium poll
- Refactored the existing manual lipsync cleanup into `cleanupStaleLipsyncRows`, keeping only the newest ready clip that matches each segment's current `audio_url` and soft-removing stale/duplicate ready rows plus failed rows.
- `POST /api/podcasts/[id]/lipsync` now runs this cleanup automatically when `action:"poll"` finishes with `processing === 0`; automatic cleanup is fail-soft so a transient prune issue cannot break a completed premium sync.
- The explicit `action:"cleanup"` remains available and still returns 500 on cleanup failure for manual/support use.
- Validation: targeted lipsync route tests 11/11, full test suite 887/887, `npm run build` OK, `npx tsc --noEmit` clean after build. No HeyGen calls, no Modal changes, no credit spend.

## 2026-07-07 � Codex � T-1146 segment-level premium lip-sync regenerate
- Added per-segment premium lip-sync state on `/create/podcast`: ready / needs voice / needs premium sync / processing / failed.
- Added a line-level �Sync this line� action that calls the existing lipsync route with `segmentIds:[id]`; bulk �Generate missing sync� only targets missing/failed segments.
- Hardened `/api/podcasts/[id]/lipsync`: cache-miss premium sync clears stale `video_url/render_status/render_error` before reserving/spending, while cached-only/poll-only flows do not reset; GET now returns current per-segment sync status and ignores stale clips from old audio URLs.
- Editing or regenerating a line updates local premium state so the old final video is not shown as current. Existing cache/dedup is preserved: unchanged segments reuse their clips, edited lines generate only their own premium sync.
- Validation: targeted lipsync route tests 9/9, full test suite 885/885, `npm run build` OK, `npx tsc --noEmit` clean after build.
# agent/log.md — Journal chronologique

Entrée la plus récente en haut. Format :

```
## 2026-07-04 — Codex — T-1143b admin base clip cache route
- Added admin-gated `POST /api/admin/podcast-base-clips` with two explicit actions:
  `ensure` creates/reuses a HeyGen base clip cache row for a persona, and `poll` copies a completed HeyGen
  base clip to permanent R2 storage before marking it ready.
- The route is multi-step to avoid serverless timeouts and is intentionally admin-only because it can spend HeyGen
  credits. `ensure` requires an explicit HeyGen `voice_id`; no hidden default spend is baked into code.
- Cache invariant enforced in code: never persist expiring HeyGen URLs as `video_url`; completed clips are downloaded
  and re-uploaded under `podcast/base-clips/{persona_id}/{clip_id}-{uuid}.mp4`.
- Validation: targeted route tests (5/5), `npm run build` OK (route registered), `npx tsc --noEmit` clean after build.
- Note: production migration for `podcast_persona_base_clips` still needs to be applied on the AlphoGen Supabase project;
  this Codex session only has the Tradinglab Supabase MCP, so it was not applied here.

## 2026-07-04 — Codex — T-1143a base clip cache contract
- Added additive migration `supabase/migrations/20260704_create_podcast_persona_base_clips.sql`
  for reusable podcast persona base clips. The table stores cache rows per persona/provider/aspect/resolution/kind
  with permanent AlphoGen-controlled `video_url`/`storage_key`, provider ids, status, metadata, RLS, and a unique
  active cache key. Migration is versioned only; not applied to production in this slice.
- Added `docs/product/podcast-base-clip-cache-contract.md`, documenting why expiring HeyGen URLs cannot be used
  directly, the R2 permanent-copy invariant, future create/reuse flow, non-goals, and next tickets T-1143b/T-1144.
- Scope: schema + docs only. No runtime route, Modal change, UI, provider call, or credit spend.

## 2026-07-04 ? Codex ? T-1142 spike PASS (realistic talking portrait)
- Experimental admin-gated route used for the HeyGen podcast talking-duo spike. Added a spike-only `upload_image`
  helper to rehost normalized JPEG portraits on R2.
- Attempt 1 with existing `Alex QA Uploaded` persona proved the chain but remained an icon-style result; the first
  PNG also triggered HeyGen `missing image dimensions`, fixed by JPEG rehost. Product lesson: source portrait quality
  is decisive.
- Attempt 2 used a synthetic photorealistic podcast-host portrait (no real identity) -> JPEG 1024x1024 -> R2 ->
  `createPhotoAvatar` -> `createAvatarVideo` -> `createLipsync(..., precision)` with real AlphoGen podcast TTS.
- Result: final MP4 `C:\tmp\heygen-realistic-person-lipsync.mp4`, 4.68s, 1280x720, H.264/AAC. Frame
  `C:\tmp\heygen-realistic-person-lipsync-frame.png` shows a realistic talking presenter, not an icon.
- Verdict: PASS for the technical direction. Next production work should start with base clip caching + opt-in
  `talking_highlights` render mode, plus a photorealistic persona catalog and explicit cost/consent gates.
- Detailed report: `docs/product/podcast-real-video-duo-spike-report.md`.

## 2026-07-03 — Claude — T-1138 QA prod PASS (upload persona → render non-fallback)
- Podcast test `f2734d11` : persona **uploadée** « Alex QA Uploaded » assignée au GUEST → render → avatar guest
  **violet (persona, URL signée bucket privé)** ≠ placeholder bleu, host resté placeholder vert. Chemin
  non-fallback signé validé.
- Endpoint upload validé e2e (fetch page, vraie session cookie ssr) : `upload 200` → `storage_path={user_id}/{uuid}.png`
  (ownership) ; `create 200` persona `uploaded` consent enforced, `is_catalog:false`, `has_url:true` (signature OK).
- UI : picker affiche own personas séparées (divider + badge « YOU ») + section « YOUR PRESENTERS » (chip + delete)
  + form upload (nom + consentement obligatoire + garde-fou « No public figures/IP »).
- Note QA : `file_upload` du navigateur refuse les fichiers hors dossiers partagés (même après `request_directory`) →
  upload piloté via fetch page (token lu depuis cookie `sb-<ref>-auth-token`). Endpoint identique, validation réelle.
- T-1138 déployé (commit `52141ce`, Vercel) + bucket appliqué prod. Tout vert.

## 2026-07-04 — Claude — T-1139 Podcast entry polish / guided flow (UI-only)
- `/create/podcast` uniquement. Aucun backend touché (routes/TTS/Modal inchangés). Flow préservé :
  script → voices → presenters → render.
- Entrée : headline raccourci (« Create a podcast video »), sous-titre condensé, CTA « Generate script »
  (au lieu de « Generate dialogue » ; « Rewrite script » / « Writing script… »). Idée/lien/durée/style/langue
  inchangés (déjà présents). Upload script/audio reste « Soon » disabled.
- Loading guidé façon Jogg : `SCRIPT_LOADING_STEPS` (Parsing topic → Structuring → Drafting → Almost ready) +
  state `scriptStep` avancé par interval pendant `phase==='scripting'` ; bloc à coches/spinner sous le CTA.
- Recent podcasts : nouvelle section (entrée seulement, `!podcast`) branchée sur `GET /api/podcasts?limit=6`
  (existant) — miniatures (video preview / icône), titre, badge statut (Ready/Rendering/Failed/Draft), durée.
  Actions **honnêtes** : « View video » (ouvre `video_url`) si rendu ; sinon « Continue (soon) » disabled (pas de
  fausse action — le ré-open d'un brouillon dans l'éditeur n'existe pas encore).
- Type `PodcastRow` étendu (champs optionnels `target_duration_seconds`, `created_at`).
- Validation : tsc clean ; **suite complète 833/833** ; build OK.
- **QA prod PASS (2026-07-04)** : `/create/podcast` — headline « Create a podcast video » + CTA « Generate script »
  OK ; loading guidé affiché (coches vertes Parsing/Structuring/Drafting + spinner « Almost ready ») ; section
  Recent podcasts rendue (6 cartes, vraies miniatures vidéo, badges READY/DRAFT, « View video » / « Continue
  (soon) » désactivé) ; flow préservé — après « Generate script » : Dialogue + carte Presenters (Duo picker) +
  Generate voices présents. Render inchangé (backend non touché, validé aux tickets T-1136/1137).

## 2026-07-04 — Claude — T-1140 Reopen / Continue podcast draft (client-only)
- **Audit d'abord** : `GET /api/podcasts/[id]` renvoie déjà `{ podcast(*), speakers(*), segme…45736 tokens truncated…70/270, `lint` clean, `build` OK, `test:e2e` 3/3.
- Browser plugin : KO dans cette session avec `windows sandbox failed: spawn setup refresh`; fallback Playwright utilise.


## 2026-06-09 - Codex - T-401c Saved Look reuse payload helper
- Ajout `lib/saved-look-payload.ts` : helper pur pour construire le body `POST /api/jobs`
  depuis un Look sauvegarde (`look_id`, script, voix, qualite lipsync).
- `/create/avatar` reutilise ce helper pour le chemin `Create with look`.
- Tests `lib/__tests__/saved-look-payload.test.ts` : contrat, validations, cap 2000,
  default `speed`, anti provider-leak.
- Scope : pas de route/API/DB/migration/provider.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK, `test:e2e` 3/3.


## 2026-06-09 - Codex - T-401d blocked audit + T-801a UGC Studio spec
- Supabase live audit tente en lecture seule : `list_tables` et `execute_sql` bloques
  par access-control ; `.env.local` sans service-role/DB URL.
- Livre `docs/product/saved-looks-supabase-audit.md` avec constat, evidence locale,
  requetes SQL lecture seule et recommandation de ne pas migrer avant audit privilegie.
- Livre `docs/product/ugc-studio-spec.md` : Product/UGC flow, references V1 via
  `outfit_style`, Verified Faces/Saved Looks/AI Director/Social Pack, slices T-801.
- Scope : docs/coordination only ; aucune route/API/DB/migration/runtime.
- Validation : `tsc` clean, `vitest` 274/274, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801b UGC Director helper
- Ajout `lib/ugc-director.ts` : helper pur product/outfit/angle/platform/creator
  -> prompt global + aspect ratio + scenes Director.
- V1 utilise les labels de references compatibles (`image 1`, `image 2`) sans nouveau role DB.
- Tests `lib/__tests__/ugc-director.test.ts` : 6 scenes avec outfit, 5 sans outfit,
  mapping aspect ratio, variantes angle/creator, fallbacks, anti provider-leak.
- Scope : helper/test/docs only ; aucune UI, route, API, DB, migration ou provider.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK.


## 2026-06-09 - Codex - T-801c UGC panel in create flow
- Ajout d'un panneau UGC Studio UI-only sur `/create/product` et `/create/social`.
- Le panneau lit les images deja inserees dans le composer : premiere image = product,
  deuxieme image = outfit/style, sans nouveau role de reference.
- `Build UGC Director plan` appelle `buildUGCDirectorPlan()`, applique l'aspect ratio,
  plafonne scenes/duree selon le plan et ouvre le AI Director avec scenes locales.
- Scope : aucune route/API/DB/migration/provider ; `Generate Video` classique inchange.
- Validation : `tsc` clean, `vitest` 280/280, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-801d explicit UGC reference roles
- Ajout des roles image `product_reference` et `outfit_reference` au contrat `ReferenceRole` et a `validateReferences()` ; `outfit_style` reste accepte pour compat legacy.
- `/create/product` et `/create/social` affichent deux slots pres du composer : Product reference et Outfit/style, avec upload fichier ou drag/drop.
- Les uploads UGC portent le role explicite dans `references_payload`, mais le Director conserve les placeholders modele `image 1` / `image 2` via le serializer du composer.
- `ReferenceUpload` expose aussi Product + Outfit/Style comme slots images explicites.
- Scope : aucune DB/migration/route/provider/state machine.
- Validation : `tsc` clean, `vitest` 281/281, `lint` clean, `build` OK, `test:e2e` 3/3. Browser plugin KO connu (`windows sandbox failed: spawn setup refresh`), fallback Playwright utilise.

## 2026-06-09 - Codex - T-801e UGC creator identity polish
- Ajout d'un panneau `Creator identity` dans UGC Studio (`/create/product`, `/create/social`) : Product-first, Verified face, Saved Look, Avatar.
- Les cartes affichent disponibilite, miniatures quand disponibles et selecteurs si plusieurs assets existent.
- Chargement paresseux de `/api/looks` pour Saved Looks ; `/api/heygen` se charge aussi quand l'identite Avatar est choisie.
- `lib/ugc-director.ts` accepte `creatorLabel` et injecte le nom de l'identite choisie dans les prompts/scenes Director ; tests ajoutes.
- Scope : UI/helper/test only ; aucun changement route/API/DB/migration/provider/state machine.
- Validation : `tsc` clean, `vitest` 282/282, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-801f UGC Social Pack presets
- Ajout `lib/ugc-social-pack.ts` : presets TikTok/Reels, Instagram feed et Landscape ad avec aspect ratio, formats cibles, brief metadata, hook/CTA et hashtags.
- `buildUGCDirectorPlan()` integre le preset social dans le prompt global, les scenes hook/CTA et expose `plan.social`.
- UGC Studio affiche un encart `Social Pack preset` sur `/create/product` et `/create/social` ; le build UGC passe `caption_mode` a `auto`.
- Tests ajoutes/etendus : `ugc-social-pack.test.ts` + contrat Social Pack dans `ugc-director.test.ts`.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.
- Validation : `tsc` clean, `vitest` 286/286, `lint` clean, `build` OK, `test:e2e` 3/3.

## 2026-06-09 - Codex - T-802 UGC generation contract
- Livre `docs/product/ugc-generation-contract.md` : contrat produit/technique de la
  generation UGC V1.
- Clarifie la baseline actuelle : UGC Studio = references product/outfit + creator
  identity + AI Director + Social Pack sur le payload jobs existant.
- Verrouille les non-promesses V1 : pas de try-on exact garanti, pas de preservation
  parfaite produit/logo, pas de lipsync natif voix importee, pas de consistence 120s
  garantie sur tous les chemins modele.
- Ajoute R-017 pour garder ce risque visible avant tout futur T-803 exact try-on /
  product grounding.
- Scope : docs/coordination only ; aucune route/API/DB/migration/runtime/provider.

## 2026-06-09 - Codex - T-802b UGC payload audit
- Audit livre : `docs/product/ugc-payload-audit.md`.
- Conclusion : le `POST /api/jobs` existant preserve les champs UGC V1 importants :
  `references_payload`, `byteplus_asset_ids`, `aspect_ratio`, `caption_mode` et
  `scenes[]` -> `storyboard`/`job_scenes`.
- Ajout d'un test route-level dans `app/api/jobs/route.test.ts` pour verrouiller un
  payload UGC complet avec product/outfit refs, verified face assets, captions auto,
  format 9:16 et deux scenes Director clampées.
- Decision : pas de route dediee `/api/ugc/jobs` en V1 ; le contrat jobs existant
  suffit tant qu'on reste sur UGC planning/generation best-effort.

## 2026-06-09 - Codex - T-802c UGC readiness score
- Ajout `lib/ugc-readiness.ts` : helper pur qui classe le plan UGC en Ready,
  Missing product, Style-only, Needs identity ou Best effort.
- Panneau UGC (`/create/product` et `/create/social`) : nouvel encart readiness
  reactif avec checks Product / Style / Identity. Il informe sans bloquer le flow.
- Tests `lib/__tests__/ugc-readiness.test.ts` : statuts, identites indisponibles,
  copy best-effort pour outfit/try-on et guard anti provider-leak.
- Scope : UI/helper/test only ; aucune route/API/DB/migration/provider/state machine.

## 2026-06-09 - Codex - T-802d UGC backend decision
- Livre `docs/product/ugc-backend-decision.md`.
- Decision : pas de route dediee `/api/ugc/jobs` en V1. UGC reste une couche
  planning/orchestration au-dessus du `POST /api/jobs` existant.
- Raison : T-802b prouve que les champs UGC V1 sont preserves et que le chemin jobs
  garde validation references, quota, plan gates, content policy, routing et state
  machine centralises.
- Scope : docs/coordination only ; aucun runtime/route/API/DB/migration/provider.

## 2026-06-09 - Codex - T-803a exact try-on / product grounding spec
- Livre `docs/product/ugc-exact-tryon-grounding-spec.md`.
- Specifie les tiers de capacite futurs : product-grounded UGC, logo/text
  preservation, outfit style transfer, exact try-on.
- Cadre la copy autorisee/interdite, les besoins data/payload, consent/safety,
  evaluation harness et les tranches T-803b/c/d/e.
- Decision : ne pas ajouter de backend dedie sans validation modele/payload concrete.
- Scope : docs/coordination only ; aucun runtime/route/API/DB/migration/provider.

## 2026-06-09 - Codex - T-803b UGC capability matrix
- Ajout `lib/ugc-capabilities.ts` : matrice provider-neutral des capacites UGC par
  modele public (product grounding, logo/text, outfit style, exact try-on,
  verified identity, duree fiable, usages/cautions).
- Exact try-on est explicitement `none` pour tous les modeles actuels : pas de
  promesse avant validation T-803e.
- Tests `lib/__tests__/ugc-capabilities.test.ts` : Auto, product grounding,
  avatar vs product, defaults prudents, anti provider-leak.
- Scope : helper/test/docs only ; aucune route/API/DB/migration/provider/state machine.

## 2026-06-09 - Codex - T-1004 public gallery from curated rows
- Branche `/gallery` sur `gallery_items` via le client Supabase public/RLS :
  `status='published'` uniquement, tri featured puis sort_order puis published_at.
- `GalleryShowcasePage` accepte des lignes curatées et conserve le fallback
  placeholders privacy-first si aucun item n'est publié.
- Garanties : aucune lecture directe de `jobs`, aucune route admin, aucun service-role
  côté galerie publique ; le manager admin T-1003 reste la seule source de publication.

## 2026-06-09 - Codex - T-1005/1006 gallery lightbox/filter QA
- Finalise la tranche lightbox/create-similar/QA côté galerie publique.
- Le CTA `Create similar` reste sûr : il utilise `reference_job_id` seulement si
  l'item public curaté possède un `source_job_id`, sinon il démarre un create flow vierge.
- Les filtres de catégories sont maintenant fonctionnels côté client.
- QA réalisée sur `/gallery` : HTTP 200, capture Playwright OK, e2e 3/3.

## 2026-06-10 - Codex - T-1003 admin jobs Add to gallery
- Ajout d'une action `Add` dans `/admin/jobs` pour les jobs `done`.
- L'action appelle `POST /api/admin/gallery/from-job`, cree uniquement un brouillon
  galerie, puis redirige vers `/admin/gallery` pour edition/publication manuelle.
- Confidentialite conservee : aucun item n'est publie automatiquement et le prompt
  prive brut reste protege par `galleryDraftFromJob`.

## 2026-06-10 - Codex - Axe 11 Premium Product Experience T-1101/T-1102/T-1103
- Ajout `docs/product/premium-product-experience-spec.md` : direction globale
  Runway-like / Director Console, principes media-first, privacy-first, non-goals
  et ordre des passes futures.
- Ajout de primitives marketing premium partagees dans
  `components/premium/premium-marketing.tsx`.
- Rebuild de la landing `/` : hero Director Console, workflows, section UGC/product,
  post-generation studio, curation/privacy copy. Scope public UI-only.

## 2026-06-10 - Codex - T-1105 create flow premium polish
- Polish UI-only de `/create/[mode]` : fond warm-neutral, header `Production brief`,
  métriques plan/format/scènes, formulaire encadré premium, rail assets plus clair.
- Director Console transformée en surface sombre media-led cohérente avec la landing ;
  panel AI Director ouvert harmonisé au nouveau langage visuel.
- Aucun changement de submit, payload `POST /api/jobs`, routes, DB, provider routing ou
  state machine.

## 2026-06-10 - Codex - T-1106 job studio premium polish
- Polish UI-only de `/jobs/[id]` : fond warm-neutral, video principale en surface
  media-led sombre, bloc `Post-generation studio`, actions download/share/reference
  harmonisees et rail desktop plus editorial.
- Cartes Status/Production nettoyees ; labels modeles passes par
  `cleanModelName(getEngineDisplayName(...))` pour rester provider-neutral.
- Aucun changement handler, route, API, DB, retry, duplicate, save-look, scene panel ou
  Social Pack.

## 2026-06-10 - Codex - T-1107/T-1108 secondary workspace premium pass
- Polish UI-only de `/projects`, `/library`, `/analytics` et `/schedule` :
  fond warm-neutral, headers editoriaux, surfaces blanches, tabs/filtres plus sobres,
  cards et CTA harmonises avec landing/create/job.
- Analytics nettoie les noms modeles via `cleanModelName(getEngineDisplayName(...))`.
- Aucun changement requetes Supabase, endpoints, drag/drop schedule, actions projets,
  liens library, analytics API ou logique metier.

## 2026-06-10 - Codex - T-1104 home command center V2
- Polish UI-only de `/home` : fond warm-neutral, hero workspace blanc, CTA neutre,
  production pulse, pipeline, starters et recent projects alignes avec l'Axe 11.
- Aucun changement requete Supabase, navigation, auth, routes ou logique metier.

## 2026-06-10 - Codex - T-1109 public secondary pages premium pass
- Polish UI/copy-only de `/pricing`, `/about` et `/technology` pour les aligner
  avec la direction Axe 11 : warm-neutral, surfaces editoriales, CTA sobres,
  langage studio/Director plutot que template SaaS ou page stack.
- Confidentialite : textes publics provider-neutral ; `/technology` ne liste plus
  les providers/infra/modeles internes et parle de capacites/orchestration.
- Pricing conserve le flux checkout existant via `/api/stripe/checkout` ; aucune
  route/API/DB/auth/Stripe modifiee.
- Diagnostic Vercel : le commit `d6b4647` (signale en erreur cote Vercel) build
  correctement en local ; si Vercel echoue encore, recuperer les logs exacts.

## 2026-06-10 - Codex - T-1110 public utility pages premium pass
- Polish UI/copy-only de `/login`, `/generate`, `/blog`, `/blog/[slug]`,
  `/privacy`, `/terms` et `/help/verified-face-id` pour terminer l'homogeneite
  publique Axe 11.
- Login conserve les appels Supabase auth existants ; `/generate` conserve le
  POST `/api/jobs` existant, avec une orientation plus claire vers la Director Console.
- Blog/legal/help rendus provider-neutral : suppression des noms infra/providers
  visibles dans les articles, privacy/terms et aide verified face ID.
- Aucun changement route/API/DB/auth/generation/checkout.

## 2026-06-10 - Codex - T-1111 public premium E2E smoke QA
- Browser plugin indisponible dans cette session (`windows sandbox failed`) ;
  fallback Playwright local utilise sur `http://localhost:3002`.
- Mise a jour du smoke E2E : login accepte le nouveau CTA `Enter studio` et un
  test parcourt les pages publiques premium (`pricing/about/technology/blog/
  privacy/terms/help/generate`) en verifiant headlines + absence de noms
  providers visibles.
- Validation : Playwright 4/4, Vitest 399/399, tsc clean, lint clean.

## 2026-06-10 — Claude (Haiku 4.5) — T-802 + T-803 Lip-sync reuse end-to-end
- Fait : Feature end-to-end T-802 + T-803 en cascade (affordance UX + costing transparency).
- T-802 : Button "Reuse with new voice" sur page job (HeyGen Avatar Shots only)
  - Affiche après sauvegarde Look, navigue `/create/avatar?look_id={id}`
  - Capture `look.id` retourné par `POST /api/looks`, stocke dans `savedLookId` state
- T-803 : Cost estimation + display réactif
  - Nouveau `lib/lipsync-cost.ts` : `estimateLipsyncCost(scriptLength, mode, duration)`
  - Estime TTS (~0.01 cr/100 chars) + lip-sync (speed 2cr/s, precision 5cr/s)
  - Display `/create/avatar` : "X credits (~Y% of full video)" avec breakdown
  - Recalcule réactivement lors édition script ou changement mode
  - Nouveau `lib/__tests__/lipsync-cost.test.ts` : 6 unit tests (heuristiques, cas limites)
- Fichiers : `app/jobs/[id]/page.tsx`, `app/(workspace)/create/avatar/page.tsx`,
  `lib/lipsync-cost.ts`, `lib/__tests__/lipsync-cost.test.ts`
- Validation : tsc ✓, lint ✓, tests 408/408 ✓
- Commit : 6fd7e5c

## 2026-06-10 — Claude (Haiku 4.5) — T-801 Audit & Spec : Lip-sync existing video
- Fait : Audit complet docs-only de la feature lip-sync/reuse Look, sans runtime code.
  Examen des fichiers clés : `app/(workspace)/create/avatar/page.tsx` (Reuse Look UI),
  `lib/saved-look-payload.ts` (validation payload), `app/api/looks/route.ts`
  (save/list/delete), `app/api/jobs/route.ts` (look_id branch, lip-sync workflow),
  `lib/heygen-client.ts` (generateSpeech, createLipsync helpers).
- Livraison : `docs/product/lipsync-existing-video-spec.md` (~1400 lignes)
  - État ✅ implémenté : Save Look (`POST /api/looks`), Reuse Look (`/create/avatar`),
    TTS + lip-sync workflow (`POST /api/jobs` avec look_id), HeyGen helpers working
  - Limitations V1 ⚠️ : UX affordance ("Reuse with new voice" button manquante),
    costing non transparent, Library page inexistante
  - Out of scope V1 ❌ : arbitrary video lip-sync, ElevenLabs TTS, editing lip-sync results
  - Workflow synthèse : User complète Avatar Shots job → "Save as Look" → R2 persist
    → "Reuse with new voice" → nouveau script+voix → `generateSpeech()` + `createLipsync()`
    → lip-sync-only job (~5–20% coût vs full video)
  - Décisions : V1 = HeyGen Avatar Shots + HeyGen native TTS (cloned voices existantes) ;
    V2 = abstraction voice_provider pour ElevenLabs/open-source TTS
  - Open questions résolues : spec costing model, error handling, security/privacy
  - Appendix : API examples, testing strategy, rollout phases (V1/V2/V3)
- Mise à jour docs : `agent/tasks.md` ajout Axe 8 (T-801 done, T-802 affordance UI,
  T-803 costing transparency, T-804–T-805 V2 futures)
- Validation : spec review-ready, docs conf orme YAML/Markdown, aucun breaking change,
  tests 399/399 passing, tsc clean, lint clean

## 2026-06-10 — Codex — T-901 Favorites V1
- Fait : ajout d'un favori utilisateur par job vidéo, sans migration DB.
- Données : stockage dans `jobs.app_state.favorite`, avec helper pur
  `lib/job-favorite.ts` pour lire/écrire le flag sans écraser l'état existant.
- API : `PATCH /api/jobs/[id]` accepte `{ favorite: boolean }`, vérifie
  l'authentification + ownership, et ne modifie pas `updated_at`.
- UI :
  - bouton `Favorite/Favorited` sur la page job ;
  - filtre + badge `Favorites` dans Library ;
  - filtre + badge `Favorites` dans Projects.
- Tests : `lib/__tests__/job-favorite.test.ts` couvre les cas app_state true/false,
  préservation d'état et valeurs invalides.


## T-1144b-lite — Podcast render mode UI + disclosure (2026-07-05, Claude)
- FAIT : mode de rendu explicite via `podcasts.metadata.render_mode`
  (`static` | `talking_visual` | `lipsync_premium`). Aucune migration.
  - Backend : `isPodcastRenderMode` (lib/podcast/podcast.ts) ; POST + PATCH
    `/api/podcasts` valident et persistent render_mode dans metadata.
  - Modal `render_podcast` : lit `metadata.render_mode`. `static` → bypass des
    base clips (portraits statiques) ; `talking_visual` (défaut) = comportement
    T-1144a ; `lipsync_premium` non actif (traité comme talking_visual pour
    l'instant). Inconnu/absent → talking_visual. Fallback statique inchangé.
  - UI /create/podcast : sélecteur 3 cartes + disclosure explicite
    ("Talking visual = vraies personnes animées, PAS de lip-sync exact").
    "Lip-sync premium — soon" affiché **disabled**. render_mode persisté à la
    création, au rewrite (PATCH) et juste avant le render ; restauré à la
    réouverture (premium jamais re-sélectionné).
- Validé : py_compile OK, tsc OK, vitest 66/66 (nouveaux tests POST+PATCH
  render_mode valide/invalide), `npm run build` OK.
- Deploy : commit 768fedc poussé → GH Actions deploy-modal.yml **success**.
- QA prod (podcast e531f932, Maya host + Leo guest, base clips 1:1 ready) :
  renders déclenchés directement sur la fonction Modal déployée. Logs live
  confirment les DEUX branches :
    * `render_mode=static → static portraits (base clips bypassed)`
    * `render_mode=talking_visual → talking-duo base clips host=yes guest=yes`
  Les deux renders terminent en `done`. Podcast restauré en talking_visual.
- NON fait : lip-sync réel par segment (T-1144b), mini-gate coût/qualité
  lip-sync 1 segment, activation réelle de `lipsync_premium`.


## T-1144b-lite hardening (2026-07-05, Claude)
- P2 : PATCH /api/podcasts/[id] invalide le render obsolète quand render_mode
  change réellement (video_url=null, render_status='idle', render_error=null) ;
  no-op si inchangé (null == talking_visual par défaut, pas de reset).
- P2 : renderPodcast (UI) stoppe avec une erreur claire si le PATCH render_mode
  échoue — le render ne part plus avec des metadata périmées.
- P3 : POST + PATCH rejettent `lipsync_premium` (400 "not available yet") tant
  que le vrai pipeline (T-1144b) n'existe pas. Modal inchangé (fallback conservé).
- Tests : invalidation on-change, no-op unchanged, missing==talking_visual,
  rejet lipsync_premium (POST+PATCH). tsc + build + vitest OK (28 podcast routes).


## Mini-gate lip-sync 1 segment (2026-07-05, Claude)
- Objectif : gate qualité/coût/temps/fit avant T-1143/T-1144b. Précision, 1 clip.
- Exécution : route admin `podcast-lipsync-spike` (clé HeyGen server-side).
  Base clip Maya 1:1/720p ready (4.28 s, réutilisé, 0 cr) + notre TTS
  (e531f932 order_index 0, 4.49 s). Seul appel payant = 1 createLipsync.
- Résultats :
  * Q1 qualité (notre TTS) : ✅ convaincant, photoréaliste, bouche synchro
    variable (ouverte t≈2.0s, fermée t≈3.6s), pas d'artefact bouche visible 720p.
  * Q2 coût : payload HeyGen n'expose pas les crédits/tâche → à relever au
    dashboard. Heuristique precision ~16–23 cr. 1ʳᵉ tentative échouée =
    validation duration mismatch >15% → 0 crédit.
  * Q3 temps : ~90–100 s wall-clock pour 1 clip 4.5 s precision (async).
  * Q4 fit : ✅ sortie 720×720 (1:1) = format des cartes T-1144a, drop-in.
  * Appris : audio doit être à ±15% de la durée du base clip ; `end_time` seul
    ne trim pas quand enable_dynamic_duration=true.
- Ajout diagnostic : step `raw_lipsync` (GET, no spend) dans la spike route
  (commit 2fce0c2) pour lire le failure_message brut HeyGen.
- Verdict : GO T-1143/T-1144b, conditionné à la confirmation du coût réel
  (dashboard) + estimateur de coût/opt-in (T-1145) d'abord. Comparer speed vs
  precision seulement si precision trop cher.


## T-1145 — Lip-sync premium cost estimator + opt-in gate (2026-07-05, Claude)
- FAIT (aucun crédit dépensé, pas de batch, pas d'appel HeyGen) :
  - `lib/podcast/lipsync-estimate.ts` (pur) : taux réel observé
    `LIPSYNC_USD_PER_SECOND=0.04` (dashboard : ~$0.20/5s), marge +15%,
    proxy durée depuis le texte (`secondsFromText`, ~14 char/s), temps estimé
    via concurrence (100 s/clip, 4 en //). Constante `HEYGEN_DURATION_TOLERANCE`
    (±15%) exportée pour T-1144b. 10 tests.
  - UI /create/podcast : la carte "Lip-sync premium" n'est plus flat-disabled ;
    badge Paid + estimation live "Est. $X · ~Y min". Sa sélection passe par une
    modale de confirmation (clips, secondes, temps, coût +15%) exigeant un
    "I understand the cost". talking_visual reste le défaut gratuit.
  - Garde-fous : le rendu premium est bloqué côté UI (message "arrive avec
    T-1144b") — aucun spend/échec. Persistance create/rewrite coerce premium →
    talking_visual pour ne pas heurter le 400 API (premium non live).
- Validé : tsc OK, `npm run build` OK, vitest 172/172 (podcast + routes).
- NON fait : rendu lip-sync réel (T-1144b), cache par segment, activation du
  spend premium. Coût réel HeyGen confirmé : $0.04/s (Video Translation).


## T-1144b QA (2026-07-07, Claude) — commit 3b8d5d3 (main, deployed)
QA prod du fix "trim + freeze inactive". Podcast e531f932 (8 segments, base clip 4.26s).
Résultat : compositing Modal CORRECT, mais 2 bugs bloquants côté génération.

VALIDÉ (Modal compositing, render gratuit) — mesuré par diff pixel inter-frames /panneau :
- seg0 (host actif, vrai clip) : diff host=0.39 / guest=0.00 → seul l'actif bouge, inactif GELÉ.
- seg1 (guest actif, SANS clip → fallback) : host=0.07 / guest=0.51 → fallback talking_visual OK.
- seg3 (guest actif, vrai clip) : host=0.07 / guest=0.49 → OK.
- Captions OK. Plus de "both lips moving". Speaker inactif = portrait statique dimmed.

BUG 1 (BLOQUANT) — ffmpeg-static ne s'exécute pas sur Vercel :
  error "spawn /var/task/.next/server/app/api/podcasts/[id]/lipsync/ffmpeg ENOENT".
  → 7/8 segments (ceux nécessitant un trim physique, audio < base clip) échouent en
  create_failed. Seul l'order 0 (audio 4.49 > base 4.26, pas de trim) est passé.
  Binaire non tracé dans le bundle lambda. Fix = décision produit (bundling vs Modal-trim
  vs HeyGen native trim).

BUG 2 (DOUBLE-SPEND) — cache non déduplicant :
  cache_key = hash(version|mode|base_clip_id|audio_url). Instable car (a) base_clip_id
  "newest wins" alors qu'il existe plusieurs base clips ready/persona (ancien row=c6688552,
  nouveau=1adb70f4), (b) format de hash changé (ancien ls-v1_dd16fbb8ea… hex vs nouveau
  ls-v1_12vx6ta djb2). → l'order 0 déjà READY a été re-billé ($0.18). Fix = route cache :
  dédupliquer sur (segment_id + audio_url courant) et réutiliser tout clip ready même audio,
  indépendamment de base_clip_id/format de clé.

COSMÉTIQUE (non bloquant) — dans la branche premium, le speaker inactif est collé via
  host_dim/guest_dim (220px, rond) sans resize à avatar_size → l'actif (clip lip-sync, carré
  ~180px) et l'inactif (portrait rond plus grand) ont des tailles/formes incohérentes.

Spend réel session : $0.18 (1 seul appel HeyGen ; 7 échecs = 0 crédit ; cap $1.50 respecté).
État cache final : 3 segments ready (4 rows, dont 1 doublon order0), 12 failed, 0 processing.
Verdict : compositing prêt ; débloquer la génération (BUG 1) + stopper le double-spend (BUG 2)
avant d'ouvrir plus large. Aucune migration. Story/Product/Research non touchés.


## T-1144b QA re-test PASS (2026-07-07, Claude) — 1 segment, capped
Fixes déployés : trim sur Modal (bd399c9 chain), audio conservé (-c:a aac), clé R2 unique.
Re-QA segment e6c2b9d4 (order 6, audio 3.26s, base 4.26s → trim requis) :
- start segmentIds=[e6c2b9d4] → started:1, skipped:0, actualNewSpendUsd $0.13 (cap $1.50).
- HeyGen a reçu l'URL R2 trimée (durée vue 3.28s ≈ audio 3.26s), pas l'original.
- Job → ready en ~119s. Sortie finale valide : 720x720 h264 + AAC, 3.28s.
Bugs résolus le long du chemin :
  1. ffmpeg-static ENOENT Vercel → trim déplacé sur Modal (endpoint /trim-base-clip).
  2. cache double-spend → dédup sur (segment_id + audio_url), clé sans base_clip_id.
  3. "audio missing" (HeyGen) → le trim strippait l'audio (-an) → gardé en AAC.
  4. "audio missing" persistant → CDN R2 servait la copie stale (même clé) → clé unique/uuid.
Spend QA total session ~ $0.57 max (0.18 double-spend initial + 3×0.13 essais e6c2b9d4 ;
les jobs échoués HeyGen ne sont en principe pas facturés → réel probablement ~$0.31 ;
à confirmer dashboard). Aucune migration. Podcast complet NON relancé (attente GO).
Reste validé antérieurement : compositing (actif bouge / inactif gelé / fallback), captions.
Cosmétique connu non corrigé : taille actif (clip carré) vs inactif (portrait rond) incohérente.


## T-1144b full short-podcast QA PASS (2026-07-07, Claude) — commit 95494d9
Cosmétique fix : inactif premium collé via base-clip dim frame (avatar_size, rounded
square) → même taille/forme que le clip actif. Deploy Modal OK.
Full premium QA sur e531f932 (8 segments, base 4.26s) :
- start (tous) → selected 8, cached 4 (0 re-spend), started 4, skipped 0,
  actualNewSpendUsd $0.56, estimatedUsd total $1.17 (cap $1.50). Pas de double-spend.
- poll → 8/8 ready, 0 failed, ~181s wall-clock (4 clips en //).
- render premium gratuit → vidéo finale 1280x720, 31.67s, valide.
Vérifs visuelles (diff pixel /panneau) :
  seg0 host 0.64 / guest 0.00 ; seg1 host 0.07 / guest 0.44 ;
  seg2 host 0.57 / guest 0.00 ; seg5 host 0.00 / guest 0.62.
  → seul l'actif bouge, inactif gelé, tailles/cadrages cohérents, captions OK.
Verdict : pipeline premium T-1144b Phase 1 opérationnel end-to-end (capped, cached,
fallback-safe, no double-spend). Re-render = $0 (cache). 1er render 8 seg ≈ $1.17.
Spend session (max) ~$1.13 ; réel probable ~$0.87 (jobs échoués non facturés) — à
confirmer dashboard. Aucune migration. Story/Product/Research non touchés.
Bugs restants : aucun bloquant. Suite proposée : T-1146 regenerate segment-level.


## T-1146 QA PASS (2026-07-07, Claude) — segment-level premium regenerate, 1 segment
Pre-QA fix (140b79e) : Modal _resolve_segment_lipsync_clips ne prenait pas en compte
l'audio_url courant → risque de clip STALE après revoicing (surtout avec un ancien ET
un nouveau row ready). Corrigé : ne réutilise qu'un clip dont audio_url == audio courant
du segment, newest wins ; sinon fallback. Deploy Modal OK. Aucune migration.
QA prod e531f932 (premium complet 8/8) — édition d'1 ligne courte (order 5, guest) :
- PATCH texte → audio null, status pending, render invalidé (video_url null, idle). GET: seg5 needs_voice, 7 autres ready.
- /tts preview seg5 → nouvel audio_url, ready. GET: seg5 missing (nouvel audio ≠ ancien clip), 7 autres ready.
- start segmentIds=[seg5] → selected 1, cached 0, started 1, actualNewSpendUsd $0.09 (< cap QA $0.25). 0 autre segment touché (vérifié: 0 rows récents ailleurs → pas de double-spend).
- poll → ready ~102s. DB seg5 : 2 rows ready (nouvel audio=match TRUE le plus récent + ancien audio=match FALSE stale) + 2 failed anciens.
- render premium gratuit → seg5 : caption = nouveau texte, guest actif (lip-sync nouveau clip), host gelé, tailles cohérentes ; host/guest motion 0.0/0.5. Durée 30.5s (ligne plus courte).
Verdict : workflow Descript-like OK — édition ciblée régénère uniquement voix+lip-sync du segment, autres en cache, pas de double-spend, pas de stale MP4. Coût QA lip-sync $0.09.
Note : les 2 clips Leo (ancien/nouveau) sont visuellement indiscernables ; la non-staleness
est garantie par le resolver (match audio_url + newest), déployé avant la QA.
Bugs restants : aucun bloquant. Anciennes rows stale/failed s'accumulent (nettoyage = amélioration future, non bloquant).


## T-1146 UI-click QA PASS (2026-07-07, Claude) — commit 4c15514
Fix reopen (4c15514) : render_mode=lipsync_premium restauré à la réouverture (+ coût
considéré acquitté) → badges premium par ligne visibles immédiatement. Deploy Vercel OK.
QA UI prod (/create/podcast?podcast_id=e531f932) :
- Réouverture : mode "Lip-sync premium" présélectionné (Est. $1.47 · ~3 min).
- Chaque ligne affiche un badge : vert "PREMIUM SYNC READY".
- Edité 1 ligne (order5) + revoicé via API → à la réouverture la ligne montre
  badge ambre "NEEDS PREMIUM SYNC" + bouton "⚡ Sync this line".
- Clic réel "Sync this line" dans l'UI → badge passe bleu "⟳ GENERATING SYNC"
  (spinner) → puis vert "PREMIUM SYNC READY". Compréhensible.
- DB : 1 seule row touchée, 1 seul segment, coût $0.07. Autres = cache. Pas de double-spend.
Verdict UI : badges + bouton + progress par ligne OK et clairs. Workflow Descript-like
utilisable end-to-end depuis l'interface. Coût QA UI : $0.07.
Suite convenue : cleanup des rows stale/failed (keep-latest ou purge), puis T-1147
provider abstraction/benchmark.


## T-1146 stale-row cleanup (2026-07-07, Claude) — commit 16addb5
Ajout POST {action:"cleanup"} sur /api/podcasts/[id]/lipsync : règle "keep latest per
segment" — garde uniquement le clip ready le plus récent qui matche l'audio courant du
segment (exactement ce que le render utilise) ; soft-delete (status='removed') toutes les
autres rows ready/failed (audio périmé, doublons même-audio, échecs supersédés). Ne touche
jamais la row gardée ni 'processing', ne supprime aucun asset R2. Pas de spend, pas de migration.
Test : keep newest current-audio, remove dup/stale/failed.
QA prod e531f932 : avant 23 rows (11 ready dont doublons, 12 failed). cleanup → removed 15,
scanned 23. Après : 8 ready (1/segment, audio courant) + 15 removed, 0 stale/failed. GET:
8/8 segments ready, aucune régression. render inchangé (resolver prend toujours le ready courant).
Verdict : table lean, correctness intacte. Coût cleanup $0.
Suite convenue : T-1147 provider abstraction/benchmark (HeyGen interchangeable) — Descript
reste inspiration workflow, pas dépendance. À démarrer sur GO.

## 2026-07-09 � T-1147e1 MuseTalk Modal GPU spike result

- Ran the isolated Modal A10G harness against one existing persona base clip + one real AlphoGen TTS segment.
- Modal auth/GPU/build path worked.
- Added dependency pins for `huggingface_hub<1.0` and `torchvision` in the harness.
- MuseTalk still failed before producing MP4 due to missing OpenMMLab runtime dependency: `ModuleNotFoundError: No module named 'mmpose'`.
- Decision: stop ad-hoc patching; HeyGen remains production baseline. MuseTalk requires a separate packaged-provider spike if revisited.

## 2026-07-09 � T-1147e2 provider shortlist after MuseTalk

- Next benchmark candidate selected: LatentSync (Apache-2.0, CLI inference, HF checkpoints, explicit VRAM requirements).
- Wav2Lip open-source excluded from next commercial path because upstream README marks the open-source code research/academic/personal and points commercial use to Sync.so.
- SadTalker / LivePortrait deferred to a separate talking-portrait/base-motion benchmark, not the segment-level provider replacement path.

## 2026-07-09 — T-1147e2 LatentSync Modal GPU one-clip spike
- Implemented isolated Modal harness `modal_app/latentsync_lipsync_spike.py` (separate app/volume, no prod route/UI/DB).
- Ran one A10G benchmark against the same AlphoGen base clip + TTS segment contract as MuseTalk.
- Result: **technical PASS**. LatentSync built, downloaded weights, ran inference, and produced a valid 512x512 MP4 with H.264 video + AAC audio, 3.36s duration, 151.12s elapsed.
- Artifact downloaded locally to `C:/tmp/latentsync-spike/latentsync-output.mp4`. Visual/product review still pending because local browser `file://` video inspection was blocked and the experimental R2 prefix is private.
- Decision: LatentSync is the first self-hosted candidate worth visual comparison against HeyGen; do not integrate into product until human visual QA and 2-3 segment cost sampling pass.
## 2026-07-12 - Codex - T-1152 LatentSync Balanced production adapter
- Promoted the four approved LatentSync samples to high-confidence human evidence and packaged the pinned model (`a229c394...`) as a separate asynchronous Modal service.
- Added a server-only Balanced feature flag, provider-neutral start/poll adapter, structured routing telemetry, automatic HeyGen fallback, and provider-aware cache isolation/cleanup/render selection.
- Public Balanced remains locked; when the flag or endpoint is absent, routing fails closed to Premium. No migration and no provider spend in this implementation slice.
- Deployed `alphogenai-latentsync` on Modal and verified its health endpoint returns the pinned commit. The GPU function was not invoked and the Balanced flag remains disabled.
## 2026-07-13 - Codex - T-1149e premium QA handoff / 2 clips still missing
- Stopped the live QA as requested; no further provider retries or premium render were launched after the second individual retry failed.
- Current production podcast: `307e628c-96a0-4ad6-b948-60a2f57c2f9a`, loaded in the signed-in browser at `/create/podcast`. Premium mode is selected, dialogue and TTS are ready for 8 lines.
- Premium lip-sync state: **6 ready, 2 missing**. The missing lines are the guest lines: `Break them down into daily habits, like checking email only twice a day.` and `Exactly, and then reviewing your progress each Friday to adjust for the next week.`
- Attempts made: one grouped `Generate missing sync` attempt, then one individual retry for each missing line. Both returned to `6 ready - 2 missing`; the full premium render was intentionally not launched.
- The new UI diagnostic commit `51bdbdc` is pushed on `origin/main`. It adds `premiumSyncFailedDetails` and displays backend `error_message` when available in the premium panel and dialogue rows. In this QA, no failure reason was returned to the UI, so the diagnostic block did not appear.
- Validation for `51bdbdc`: `npx tsc --noEmit` clean, `npm test` 82 files / 950 tests passed, `npm run build` passed. Existing build warnings only concern `<img>` usage.
- **Handoff / next action:** inspect the live `/api/podcasts/[id]/lipsync` response and the corresponding `podcast_segment_lipsync_clips` rows for the two current audio URLs. Determine whether the failure is HeyGen/trim/provider, stale cache/base-clip selection, or a missing cache row. Do not blindly repeat paid retries. Once the root cause is fixed, run at most one targeted retry, confirm `8/8 ready`, then render premium and visually verify both active-speaker directions.


## 2026-07-13 — Claude (CTO mode) — Bug audio + Phase 1 purge + Phase 2 UX
### Bug audio (T-1149e) — commit 01b3524 [FIX déployé + prouvé]
- Cause : base clips BytePlus (studio) = vidéo sans piste audio → HeyGen refuse ("Unknown lipsync error").
- Fix : Modal `trim_base_clip_for_lipsync` mux TOUJOURS une piste AAC silencieuse (anullsrc) ;
  trim seulement si dur>0 ; la route Next passe TOUT clip par Modal (garantie inconditionnelle).
- Prouvé : clip BytePlus repassé → `Stream Audio: aac 48000 stereo`. Modal+Vercel déployés, 950 tests.
- Reste : relance E2E des 2 lignes (podcast 307e628c) — bloquée sur auth navigateur (session expirée),
  à faire par l'utilisateur reconnecté. Aucun contournement d'auth, aucun spend sans action user.

### Phase 1 — purge R&D morte — commit 8520f48 [-1311 lignes]
Supprimés (non référencés en prod, vérifié par grep) :
- modal_app/self_hosted_lipsync_spike.py (MuseTalk, échec, archivé)
- modal_app/latentsync_lipsync_spike.py (remplacé par latentsync_lipsync.py)
- app/api/admin/experiments/podcast-lipsync-benchmark/ (route + test)
- lib/podcast/lipsync-provider-benchmark.ts (+ test)
Aucune var d'env orpheline. Docs de décision conservées (historique). Router prod intact
(lipsync-provider/routing/quality). ltx_video/model_lab/LatentSync NON touchés (sur demande).

### Phase 2 — dé-jargon UX (UI seule) — commit aca9b10 [-109 lignes]
- Retiré de l'UI podcast : bloc "Quality target" (Balanced / Beta / Economy / Cinema locked /
  "Using Premium today"), badges Beta/Soon, fetch quality-access, noms de tiers.
- lip-sync quality épinglée à "premium" (chemin validé) mais toujours persistée → le router
  interne la lit. Aucun choix de tier montré à l'utilisateur.
- Moteur/back inchangés (quality-access route, lipsync-beta, router, LatentSync restent internes).
- tsc + build clean, 929 tests. Podcast existant reste générable (chemins generate/render intacts).
STOP après Phase 2 (pas de Phase 3, pas de nouveau provider/abstraction).


## 2026-07-13 — Claude — Retry E2E 307e628c : bug audio FERMÉ, nouveau blocker P0
- Session reconnectée (user). Retry des 2 lignes SEULEMENT (order 5,7), $0.38.
- Audio fix VALIDÉ : HeyGen accepte désormais les clips (started:2, plus de "audio missing").
- MAIS échec HeyGen brut : "No speaker is detected in the video." → les 2 lignes sont liées à un
  base clip BytePlus studio (16:9 wide 1248x704), visage trop petit/ambigu pour la détection HeyGen.
  Les 6 lignes OK utilisaient un base clip HeyGen 1:1 close-up.
- STOP retries (même base clip = même échec). Render premium exige 8/8 → podcast NON exportable en
  premium (exportable en talking_visual). Bug audio = fermé ; blocker P0 = incompat BytePlus wide ↔ HeyGen.


## 2026-07-13 — Claude — P0 règle métier close-up (commit dc873e5) + limite qualité base clip
- Fix P0 (business rule) : le résolveur premium n'honore un base clip "preferred" QUE s'il est 1:1
  close-up ; un asset studio 16:9 (BytePlus) est ignoré → fallback vers le close-up HeyGen. ~1 ligne,
  pas d'abstraction. tsc/build/17 tests OK, Vercel déployé.
- E2E retry 307e628c (2 lignes) : la sélection est CORRIGÉE (utilise bien e5699083 = heygen 1:1
  base-v2-8s), MAIS HeyGen échoue encore "No speaker detected".
- Cause vérifiée (frames côté-à-côté) : le clip guest base-v2-8s (e5699083) est une GÉNÉRATION
  défectueuse pour le lip-sync HeyGen — yeux fermés + micro devant la bouche dans la fenêtre trimée.
  Le clip host base-v2-8s (cb84af4a, ligne 6) marche = même code, clip différent. Donc problème de
  QUALITÉ d'asset, pas de code. STOP (règle #4 : pas de hack/crop/OpenCV/refactor).
- Contrainte durée : base-v1 (4.26s) marche pour order5 (4.49s) mais PAS order7 (5.09s > 4.9) → base-v1
  ne peut pas remplacer base-v2-8s partout ; d'où la nécessité d'un base-v2-8s guest propre.
- Spend session : 2 rounds retry × $0.38 (échecs HeyGen, en principe non facturés). Plus de retry.
- Blocker V1 réel : la génération de base clips close-up doit produire un visage lip-syncable
  (yeux ouverts, bouche dégagée, micro sur le côté). Décision requise.


## 2026-07-14 — Claude — POC VEED Fabric 1.0 (T-1151) — GO
Harness isolé (commit 92d0875) : lib/veed-fabric-client.ts (fal.ai queue REST, no SDK) +
route admin experiments/veed-fabric-poc (create/poll → R2). Aucune UI/DB/abstraction/fallback.
Test 1 (Maya) : image still + audio TTS 11.94s, 480p → COMPLETED ~105s, 640x640 h264+aac 11.92s,
  2.27MB. Lip-sync OK, identité stable, décor conservé. 1er essai. ~$0.95.
Test 2 (Leo) : still + audio 11.47s, 480p → COMPLETED ~52s, 640x640 h264+aac 11.44s, 2.32MB.
  Yeux ouverts, lip-sync OK, identité stable. 1er essai. ~$0.92.
Total POC ~$1.87 (< cap $2). 2/2 réussis 1er essai, aucun base clip, aucun retry.
Fabric = image+audio→clip parlant en 1 appel → remplace base clip→trim→piste silencieuse→HeyGen→retry.
Coût : $0.08/s (480p) / $0.15/s (720p) ≈ 2-4x HeyGen ($0.04/s) mais élimine tout le pipeline fragile.
Verdict GO. Non branché en prod, ancien pipeline non supprimé (attente décision remplacement).


## 2026-07-14 — Claude — E2E Podcast Premium Fabric (T-1151) — GO
Podcast e3691b4f (Maya host / Leo guest, 9 segments, 39.3s parlé). Stills persona réutilisés
(maya-face/leo-face, extraits des base clips). Route POC évoluée en orchestrateur E2E
(plan/submit/poll_podcast) écrivant dans la table EXISTANTE podcast_segment_lipsync_clips
(provider='veed_fabric') → compositeur Modal render_podcast premium INCHANGÉ les consomme.
- plan : 9 seg, 39.3s, $3.14 (< cap $8).
- submit : 9/9 soumis, 0 skip, spend $3.14.
- poll : 9/9 ready, 0 échec, 1er essai (aucun retry). ~70s pour les 9 (parallèle).
- render (Modal existant, gratuit) : final 1280x720 16:9, h264+aac, 42.0s.
- Diff pixel : seg0 host 0.34/guest 0.00 ; seg1 host 0.10/guest 0.61 ; seg3 0.13/0.32 →
  alternance OK, speaker actif=Fabric bouge, inactif gelé. Captions synchro. Identités stables.
Coût théorique = réel = $3.14. Aucun lip-sync HeyGen lancé. Réserve : la still de l'inactif
provient encore du base clip persona (origine HeyGen) — simple image figée, pas de lip-sync.
Verdict : GO. Pipeline image+audio→clip en 1 appel, 9/9 1er essai, nettement plus simple/fiable
que HeyGen (base clip→trim→piste silencieuse→lip-sync→retry, échecs répétés). Rien supprimé,
UI non branchée, en attente décision remplacement.


## 2026-07-16 — Claude — BILAN CTO / RELAIS CODEX — URL→Video V1 (Jogg) livrée + gelée

But de cette entrée : permettre à Codex de reprendre le relais sans contexte implicite.

### Méthode produit en vigueur (à respecter)
- On construit un **SaaS rentable, pas un labo** : réutiliser l'existant, coder le minimum,
  "une intégration doit supprimer plus qu'elle n'ajoute".
- **Un workflow à la fois**, formalisé dans `docs/decision-books/` (README.md = index).
  Benchmark → POC réels → audit API → coût → décision → **gel** → workflow suivant.
- Sources **officielles uniquement** (docs/CGU/pricing). Ne jamais survendre : distinguer
  E2E prouvé / endpoint+auth / lecture. Noms providers **jamais en UI publique** (T-102 ;
  garde-fou provider-leak-guard.test.ts). Noms OK en code/commentaires/logs/admin.

### État des workflows (source : docs/decision-books/README.md)
- 🎙️ Podcast Premium V1 — 🔒 GELÉ (VEED web worker). NB : un POC Fabric/fal.ai E2E existe
  (log 2026-07-14, GO) mais **non branché** ; le decision book fige VEED.
- 🛒 URL → Video V1 — 🔒 GELÉ, **validé en prod ce jour** (Jogg). Détails ci-dessous.
- ✂️ Editing/Enhancement (V1.1) — 🔬 Descript audité (clé testée lecture seule, GO pré-V1.1).
  P0 = chiffrer le **coût crédits/action** (job agent ~32 cr ; plans 400/800/1500). Pas démarré.
- 📢 Publication — Postiz (open-source) à benchmarker = prochain candidat.

### URL → Video V1 — ce qui a été livré (commit 2c760e3, gel 6292f95)
Périmètre : **URL/produit → vidéo ad (copie auto Jogg)**, admin-only, pas d'UI publique.
Net code = 3 fichiers, 0 nouvelle table, 0 nouveau scheduler, 0 GPU :
- `lib/jogg-client.ts` — client REST Jogg (`/product` → `/create_video_from_product` → poll
  `/product_video/{id}`). Header `x-api-key`. Réponses wrappées `{code,msg,data}` (code 0 = OK).
  ATTENTION : la réponse create renvoie `data.video_id` (pas `product_video_id`) → le client lit
  `data.product_video_id ?? data.video_id`.
- `app/api/admin/experiments/url-to-video/route.ts` — submit/status, `requireAdmin`,
  budget-guard maison (plafond 20/j ; `remaining_quota` Jogg NON fiable → ne pas l'utiliser).
- `app/api/cron/jogg-poll/route.ts` — poller : `pending` → poll Jogg → download → R2 → `done`.
  Idempotent (1 job = 1 `external_task_id`). Seam overlay branding T-1111 marqué (fast-follow,
  pas branché : rendu Jogg déjà propre/sans watermark).
- `.github/workflows/evolink-cron.yml` — +1 step curl vers `/api/cron/jogg-poll` (réutilise le
  scheduler existant, pas de nouveau workflow).
Réutilise : table `jobs` (`engine_used='jogg'`, `external_task_id`=video_id Jogg, `app_state`),
`lib/r2.ts` (`downloadAndUploadToR2`), `requireAdmin`, `CRON_SECRET`.

Findings Jogg intégrés : `override_script` IGNORÉ (copie auto, pas verbatim) ; pas de webhook
joignable → polling ; sortie sans watermark 1080×1920 ; rate limit 20 POST/min.

### Env / secrets
- `JOGG_API_KEY` — **ajoutée aux env Vercel Production le 2026-07-16** (était local only ; un
  1er passage cron avait renvoyé `errors:1` faute de clé). Aussi dans `.env.local`. Doc dans
  `.env.example` (sans valeur). Clé "test" à entitlement spécial (génère à quota=0) — voir P0.
- `CRON_SECRET` — déjà en prod (protège evolink-poll ET jogg-poll).
- Autres clés utiles en `.env.local` (jamais commit) : `HEYGEN_API_KEY`, `DESCRIPT_API_KEY`.

### Validation production (preuves)
- Job prod `75c17c27-35c6-4446-9201-7b2a67b1922a` → `done`.
- Chaîne prouvée : route admin (401 sans auth) → job pending → cron GH Actions → jogg-poll
  (`polled:1`) → download → R2 → `final_url`.
- R2 : `https://pub-17f0392d1f8d4270ad79966ad1ea7545.r2.dev/url-to-video/75c17c27-35c6-4446-9201-7b2a67b1922a.mp4`
  (HTTP 200, video/mp4, 24,4 Mo). ffprobe : 1080×1920 · H264 High · 30fps · AAC mono · 36,4s.
- Temps génération ~80s. Coût ~1 crédit (0 débité sur clé test ; ≈0,99$ contractuel Advanced).
- Idempotence confirmée : 1 job jogg, 1 done, 0 double traitement.
- Gates verts : tsc 0 err · lint (warnings préexistants `<img>` seulement) · vitest 929/929 ·
  next build OK · provider-leak-guard 6/6.

### Technique de validation prod utilisée (réutilisable par Codex en headless)
Impossible de s'authentifier admin en session headless, et connecteur Vercel non authentifié.
Donc : (1) générer un `video_id` Jogg réel via le client (clé locale = même compte) ; (2) INSERT
un job `pending` (`engine_used='jogg'`, `external_task_id`) dans la DB **prod** via Supabase MCP ;
(3) déclencher le cron déployé via GitHub API `workflow_dispatch` sur `evolink-cron.yml` (token
récupéré du credential store git, non affiché) ; (4) poller le job via PostgREST (clé service).

### Backlog V2 URL→Video (repoussé volontairement)
Avatar Video (script **verbatim** via `/create_video_from_avatar` `voice.script` — prouvé POC),
AI Script pré-généré, preview 13-variantes, Lip Sync, Traduction, Templates, Photo Avatar/Motion,
**webhooks** (remplacer polling), **UI publique self-service**, branding overlay T-1111.

### P0 restants
- Business (avant ouverture PAYANTE publique, ne bloque pas la validation technique) :
  plan **Advanced** contractuel (URL→Video y est gaté) + confirmer le **compte prod** de la clé
  (`gvnahid292`) + **CGU commerciales** Jogg (revente/multi-tenant).
- La clé test génère à quota=0 = **temporaire/non contractuel** → ne pas bâtir le P&L dessus.

### Connecteurs MCP (état session)
- OK Supabase (`supabase`, projet qbrpzmuedfugbhoeytdj) — authentifié, utilisé.
- ATTENTION HeyGen "classique" (`heygen`, mcp.heygen.com/mcp/v1/) — enregistré dans ~/.claude.json
  mais **OAuth non fait** (headless) → travail HeyGen fait via **API REST** (HEYGEN_API_KEY).
  Le connecteur claude.ai "HyperFrames by HeyGen" (projets vidéo) est distinct et connecté.
- Vercel MCP — non authentifié (impossible de lire/écrire env Vercel depuis l'agent).

### Next
Ouvrir le Decision Book du **workflow suivant** (proposé : 📢 Publication → benchmark Postiz).
Ne PAS rouvrir URL→Video / Podcast (gelés) sauf bug bloquant.


## 2026-07-16 — Claude — Durcissement URL→Video V1 (quick-wins revue Codex)

Suite à la revue de code Codex (9 constats, tous vérifiés exacts). Lot "quick-wins" traité
(GO Paul, périmètre borné). Lot "avant ouverture payante" planifié dans tasks.md (pas de dev sans GO).

Corrigé :
1. **Confidentialité provider** (Codex #7, élevé P1) : `jogg → "URL to Video"` dans ENGINE_DISPLAY_NAMES ;
   `jogg` ajouté aux 2 regex de `cleanModelName` ; `Jogg` ajouté à FORBIDDEN/FORBIDDEN_RE du leak-guard ;
   tests prouvant que `/jobs/[id]` (cleanModelName∘getEngineDisplayName) ET `/v/[id]` (getEngineDisplayName) n'exposent jamais "jogg".
2. **Cron fail-closed** (Codex #1) : nouveau `lib/cron-auth.ts` (`assertCronAuth`) — refuse si CRON_SECRET absent/incorrect,
   AVANT tout `createServiceClient`. Appliqué à `jogg-poll` ET `evolink-poll` (politique cohérente). Tests: absent/incorrect/correct.
3. **Persistance honnête du poller** (Codex #5) : logique extraite dans `lib/jogg-poll-core.ts` (`settleJoggJob`, DI).
   `done`/`failed` comptés seulement après écriture DB réussie ; écriture ratée → `errors` + job récupérable (pas de faux `done`).
   Tests: échec update final, échec markFailed, missing task id, pending sans write/download.
4. **Handover reproductible** (Codex #8) : commit `podcast-premium-v1.md` + sources VEED web (worker/login/README + route)
   = brique V1 gelée réellement référencée. `.gitignore` étendus (logs/OTP, downloads, shots, *.mp4, .pytest_cache).
   Décision VEED : la V1 Podcast gelée EST le worker web → sources versionnées ; logs/downloads/shots/pycache JAMAIS commités.
5. **Cohérence docs** (Codex #9) : HANDOVER "Last updated" → 2026-07-16 ; T-1157 marquée `superseded`
   (ancienne voie HeyGen lip-sync, remplacée par le gel VEED web) ; README URL→Video = "GELÉ après hardening".

Parsing client extrait (`parseJoggEnvelope`, `parseProductVideo`) pour test unitaire (0 réseau).
Validation : tsc clean, nouveaux tests verts (voir commit). AUCUN appel Jogg payant, aucune génération prod pour ce lot.

Restent (lot avant-payant, GO requis) : DB-first reservation, quota atomique, poller batché, couverture submit/status complète.
## 2026-07-30 - Codex - T-1164c directed Product Ad quality path
- Reworked the rejected native Product Ad into a strict directed-edit contract. Creator hook and CTA shots no longer receive product images and explicitly forbid any generated/held/worn product; the product demo receives exactly one immutable first-frame product reference.
- Switched the directed shot provider from the Fast Seedance route to the full Seedance 2 quality route. The product shot is sent as first-frame image-to-video rather than a loose multi-reference prompt.
- Added deterministic French copy, one separately generated TTS voice-over, per-shot captions and CTA to the Revideo manifest. TTS and durable R2 upload complete before any paid three-shot task starts.
- Tightened the Revideo design to full-screen media, restrained branding, caption hierarchy and CTA only on the closing shot. Removed the oversized poster-like text treatment.
- Exposed `directed_edit` in the existing admin experiment page. It starts/polls the three-shot route, shows each permanent clip and reports when the edit manifest is ready. The public Product Ad workflow remains unchanged.
- Validation without provider spend: 12 focused tests pass, root TypeScript clean, Revideo worker typecheck clean and production build passes. No Seedance generation, GPU job or Hostinger deployment was started.
- Remaining gate: turn the CLI-only Revideo worker into a private authenticated Hostinger service, then run exactly one capped three-shot Beats validation and assemble the final MP4.
- The remaining worker gate is now code-ready: authenticated async `POST /render`, `GET /status/:id`, one-render-at-a-time queue, idempotent job dispatch, direct R2 upload and restart-safe re-dispatch from Next.js. Local service smoke passed (`health=200`, unauthenticated status `401`, invalid authenticated render `400`). Hostinger/Vercel deployment and the single paid QA are still pending.
## 2026-11-08 — Codex — H3 admin first private generation (code only)
- Verified PR #90 head 3fd751d: GitHub Actions job privacy run 42503519415 succeeded (15 tests); no blocking CI error to fix. Historical R2/public-page privacy remains distinct.
- Prepared branch codex/h3-admin stacked on #90: lab-derived complete graphs, manifest-bound form, private admin APIs, atomic one-use permit/admission, service-only outputs, original and -0.4s audio version, separate secret-free single-use H100 executor and CPU broker.
- Model revisions/SHA256 locked using public metadata only (five files); no weights downloaded. Dedicated read-only volume copy/hash helper prepared, never invoked.
- Free checks: 1154 Vitest tests in 107 files; TypeScript; full Next production build; lint (existing warnings only); embedded local PostgreSQL migration/admission/idempotency/terminal/permissions; 4 Python CPU tests including real ffmpeg audio shift and identical video packets; Modal SDK 1.6.3 local definition imports.
- Environment fixes during verification: npm needed normal package-network access; local temp-directory permissions initially prevented a Vitest run and synthetic ffmpeg output, resolved by using workspace tmp. SDK 1.4 lacked read-only mount API; isolated test SDK pinned to 1.6.3; removed unsupported retries option from web endpoint. No baseline test weakened.
- Prepared GitHub free-test workflow. Modal production workflow excludes the new app, Vercel review-branch auto-deployment disabled. No production/configuration state changed, no migration applied, no deployment, no GPU/paid API call.
- Activation/limits/cost and pending account checks: docs/implementation/h3-admin-activation.md. Public moderation/Studio/MOSS are not claimed complete. Owner approval required for merge, migration, CPU preparation/deployment and exactly one GPU UI test (proposed reserve $0.75 + CPU preparation, total allowance $1 within prior $3).

## 2026-11-09 — Codex — MOSS capacity window repair
- Isolated branch codex/moss-capacity-wait from main fdb1cbf. MOSS start window 300s; collection 660s; shared CPU broker hard timeout 720s. H3 start 110s/collection 310s and both GPU definitions unchanged. SQL deadline and production permits unchanged.
- Free validation: all 1,229 Vitest tests, TypeScript, production build and 25 Python tests PASS. Simulated delayed capacity accepts MOSS after 210/299s, fences at 300s, preserves H3 110s boundary and terminates containers. Existing build lint warnings remain.
- No deploy, migration, model preparation, reservation reconciliation, remote mutation or GPU run. Next: review/merge approval, then manual deployment with no active H3; separate explicit approval before one paid MOSS run. Availability within five minutes remains unproven.

## MOSS-QUEUE-CANCEL initial validation — 2026-11-09
- Python 30/31 passed; new SDK transport fixture failed before any invocation: FunctionCallCancelResponse does not exist in Modal 1.6.3. Stop further checks, correct the fixture to the RPC's actual empty response, then rerun. No production action.
- SDK fixture follow-up: real Client._stub is read-only; use a spec-constrained client transport mock while retaining the actual SDK Function, invocation, serializer, stream decoder and cancellation handle. No implementation failure or remote call occurred.
- SDK fixture correction: a truthy mocked snapshot flag caused hydration to replace the fake client. Interrupted the test; the dummy function ID was fu-moss, not a deployed executor. Use a real unopened Client with only its cached control-plane transport replaced, and forbid from_env in the test to prevent any fallback network client.

## 2026-11-09 — Codex — MOSS pre-start cancellation correction ready
- New moss_queue.py persists the native Modal invocation ID before any GPU frame, enforces a real 300s first-frame wait separately from the 660s result limit, and requests cancellation with container termination even if no frame arrives. Cancellation/stream cleanup have 20s/5s limits; uncertain submission and cancellation have explicit safe codes and never retry or refund.
- SDK 1.6.3 adapter reuses the control-plane SYNC_LEGACY generator submission and native decoder, with native hydrated cancellation handle. CPU image pins the version; other versions fail before submission. Private SDK dependency is isolated and documented; remote server/GPU confirmation remains for an explicitly authorized pilot. H3 invocation, both GPU definitions, models, grants, SQL gates and budgets unchanged.
- Studio displays distinct start, execution, cancellation, submission and SDK errors; business logs include only UUID/fixed code. CI includes the new CPU suite.
- Validation: 1,230 Vitest tests (113 files), 32 Python tests, TypeScript and production build PASS (existing lint warnings). Actual SDK with fake transport proves pre-start cancellation, input-plane metadata handling and >3MiB frame decoding. Regression covers no first frame, 210s/300s start guards, callback/database failure, wrong header, result timeout, cancellation failure and H3 behavior. Earlier fixture setup errors corrected before broad validation.
- No merge, deploy, remote migration, model preparation, permit change or paid GPU. Next: review/merge and manual deploy only after owner approval; preserve closed gate and require separate approval for one real run.
## 2026-11-23 — Codex — coexistence Parallax
- Vérifications locales : 1 081 tests Vitest passants, TypeScript propre et build de production réussi.
- Ajout des états admin/public des modules, des entrées Parallax Shorts/Audio et du garde d’accès
  pour Remix. Aucun secret, migration, appel fournisseur ou génération n’a été exécuté.

