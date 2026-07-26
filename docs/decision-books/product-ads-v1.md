# Product Ads V1

## Status

**BETA HARDENING** - implementation is live; one high-fidelity Video Presenter
calibration and one capped end-to-end request remain before the workflow can be
marked **FROZEN**.

Last reviewed: **26 July 2026**

## Product outcome

A signed-in creator can paste a product URL, choose the presenter, voice,
language, tone, duration and aspect ratio, then receive a durable video ad.
Provider names and external identifiers are never part of the public contract.

## Validated capabilities

- Product URL to finished ad, persisted to R2.
- Public and account-owned presenter selection.
- Account custom voice selection, including `gvnahid292` for French (France)
  and English.
- Format, duration and tone controls.
- Existing high-fidelity Custom Video Avatars can be selected without
  regenerating them.
- Photo presenters use the documented staged generation flow. They are an
  AI-derived likeness, not pixel-faithful identity preservation.
- User-uploaded source and consent footage are stored privately through signed
  Supabase uploads, outside the Vercel request-body limit.
- A provider-neutral asynchronous request API and a one-at-a-time worker exist
  for high-fidelity Video Presenter creation.

## Architecture decision

Product Ads uses two distinct presenter paths:

1. **AI portrait presenter**
   - Fast onboarding from a still portrait.
   - The generated appearance may differ from the source image.
   - Suitable when speed matters more than exact identity.

2. **Video Presenter**
   - Source footage plus explicit consent footage.
   - Closest available likeness and motion quality.
   - White-label AlphoGen upload, queue and catalog.
   - An operator-owned worker uses the normal provider web interface until a
     commercially viable creation API is available.

The browser bridge is a controlled beta constraint, not the long-term provider
abstraction. The public API, data model and UI remain provider-neutral so the
implementation can later move to another API without changing the product
contract.

## Queue contract

Table: `user_video_presenter_requests`

```text
uploading -> pending -> claimed -> submitted -> processing -> ready
                     \-> needs_login
                     \-> needs_review
                     \-> failed
```

Rules:

- One worker and one claimed request at a time.
- Claim is persisted before any provider interaction.
- A completed provider avatar is matched by a unique internal request name.
- Ambiguous submissions are not retried immediately.
- A retry that may start a paid operation requires explicit admin confirmation.
- Maximum three worker attempts.
- Private source and consent footage are deleted after successful publication.
- Active provider operations cannot be removed from the admin UI.
- UI drift produces `needs_review` with diagnostics; it never triggers blind
  retries.

## Operations

Admin surface: `/admin/video-presenters`

The admin can:

- filter and monitor all requests;
- identify stale worker claims;
- resume a paused authenticated session;
- explicitly confirm a retry that may spend;
- delete private footage after processing;
- remove inactive requests.

Provider names, provider IDs, private storage paths and raw provider errors are
not returned by the admin API.

## Security and consent

- Source and consent videos use a private Supabase bucket.
- RLS limits user access to their own folder.
- Service-role access is restricted to backend and worker environments.
- Consent is versioned and timestamped before upload preparation.
- No captcha, entitlement or private endpoint bypass is permitted.
- Worker screenshots and HTML diagnostics are local operational artifacts and
  must never be committed.

## Cost and retry policy

- Preparing and uploading a request costs nothing.
- The browser worker is the only component allowed to start presenter creation.
- `needs_login` and stale unsubmitted claims can be resumed without a paid
  confirmation.
- Failed or old ambiguous requests require an explicit `may spend` confirmation.
- Recent ambiguous submissions are locked for six hours so support can inspect
  the account catalog first.
- Requests stop after three attempts and require manual investigation.

## Remaining freeze gates

1. Calibrate the current `Avatars -> Custom Avatar` form read-only.
2. Confirm semantic selectors for source footage, consent footage and submit.
3. Run one approved, capped, real Video Presenter request.
4. Verify request `ready`, reusable `user_presenters` row and private-footage
   cleanup.
5. Install and supervise the worker on the Hostinger VPS.
6. Update this status to **FROZEN** with the production request evidence.

## Rollback

Disable the Video Presenter option in Product Ad and stop the private worker.
Existing public presenters, account Photo Presenters and finished Video
Presenters remain usable. No Product Ad generation or shared job state needs to
change.

