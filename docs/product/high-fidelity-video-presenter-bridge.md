# High-fidelity Video Presenter bridge

## Decision

Use an AlphoGen-owned upload, consent and queue experience. Users never need a
provider account and never see the provider.

The immediate production bridge is **manual-assisted**: an authorized operator
creates the Custom Video Avatar in the existing account, then links its
completed catalog ID to the waiting AlphoGen request from the admin queue.
AlphoGen verifies the ID against the completed account catalog before
publishing it. This avoids captcha bypasses, brittle browser automation and
blind paid retries.

The Playwright worker remains an optional calibration experiment, not the
production dependency. The queue and UI are provider-neutral so the manual
step can later be replaced by a commercial API or an in-house model.

## Flow

1. User chooses **Video presenter** in Product Ad.
2. User uploads performance footage and a separate consent clip directly to a
   private Supabase bucket using signed upload tokens.
3. `user_video_presenter_requests` enters `pending`.
4. An authorized operator completes the Custom Video Avatar workflow in the
   account using the private footage.
5. From `/admin/video-presenters`, support chooses **Link completed presenter**
   and enters the resulting catalog ID.
6. AlphoGen verifies the ID through the completed custom-avatar catalog,
   copies a neutral cover into `user-presenters`, creates or reuses the ready
   account presenter, and marks the request `ready`.
7. Only after the database link succeeds, AlphoGen deletes the sensitive
   source and consent footage. A cleanup failure is surfaced separately and
   does not lose the completed presenter.
8. Product Ad polling refreshes the completed presenter automatically.

## Guardrails

- One worker, one submission at a time.
- No captcha bypass, account rotation, stealth patches or private endpoints.
- A request is claimed before browser submission.
- Existing provider name is checked before resubmission to limit duplicates.
- UI drift stops in `needs_review` and captures local diagnostics.
- Manual linking is available only for unclaimed `pending`, `needs_login`,
  `needs_review` and `failed` requests; an active worker request cannot be
  linked concurrently.
- The entered catalog ID must be a positive integer and must resolve to a
  completed custom avatar in the account.
- Linking is idempotent by account user + external avatar ID.
- Public API returns only product state; no provider name, task id or avatar id.
- Source and consent footage are private and deleted after successful publish.

## Operational gate

For each manual-assisted request:

1. Confirm that the user request includes valid source and consent footage.
2. Complete one avatar manually in the authorized account.
3. Confirm that the avatar is completed in the account catalog.
4. Open `/admin/video-presenters`, click the link action, and enter the
   completed ID.
5. Confirm the request is `ready`, the presenter appears in the user's
   Product Ad picker, and no private-footage cleanup warning remains.

Do not bulk-submit and do not expose the account or provider to the user.

## Native independence track

Manual-assisted delivery is the short-term bridge. The strategic replacement
is an AlphoGen-native presenter pipeline using the consented performance clip
as a private base asset and LatentSync on Modal for speech animation.

That work is intentionally separate because Product Ad is currently generated
as a complete video by the external URL-to-video engine. A native presenter is
not merely another avatar ID: it requires AlphoGen to own the product-ad
timeline, voice track and compositing step.

The native track therefore proceeds in four bounded slices:

1. explicit consent to retain a reusable performance clip, with deletion and
   retention controls distinct from the current one-time processing consent;
2. private normalized base-clip storage and presenter capability metadata;
3. a provider-neutral speech-animation adapter using LatentSync first;
4. an AlphoGen Product Ad compositor that combines product media, script,
   voice, captions and the animated presenter.

Current source and consent footage must continue to be deleted after manual
publication. It must never be retained implicitly for the native track.

### Native slice 1: durable private base (T-1163b)

The first native slice is implemented behind an explicit optional consent in
the existing upload form:

- the one-time source and consent clips keep their current lifecycle;
- opting in uploads a second private copy to
  `user-presenter-native-bases`, recorded in
  `user_presenter_native_bases`;
- the native copy has its own consent version, one-year expiry, daily
  fail-closed cleanup, and an immediate user deletion action;
- no GPU/model job is started by this slice.

The duplicate direct-to-storage upload is intentional. It avoids moving up to
200 MB through Vercel and makes the retained asset independent from manual
publication cleanup.

The official product steps used for this contract are: upload/record footage,
submit a consent clip, animate, then save/create. See the official guide:
https://www.jogg.ai/academy/how-to-create-custom-avatar/

### Native slice 2: private normalization (T-1163c)

The retained performance clip is normalized asynchronously on Modal CPU before
any speech-animation model is allowed to consume it:

- Next.js claims an `uploaded` or `failed` base before triggering Modal, and
  retries reuse `normalizing` or `ready` state instead of spawning duplicates;
- Modal reads the source from the private Supabase bucket using the service
  role and writes a separate private `normalized-v1.mp4`;
- the deterministic contract is 720x720, center-cropped, 25 fps,
  H.264/yuv420p, silent stereo AAC, and at most 30 seconds;
- ffprobe validates the model-ready asset before the database can become
  `ready`;
- failures expose only a product-safe state and can be retried explicitly;
- source and normalized files are deleted together on user deletion or
  retention expiry;
- recent normalization jobs are protected from cleanup, while jobs stale for
  more than two hours no longer block retention deletion indefinitely.

This slice is CPU preprocessing only. It starts no GPU, provider, voice or
paid generation. The next slice connects the ready private base to the
provider-neutral speech-animation adapter.
