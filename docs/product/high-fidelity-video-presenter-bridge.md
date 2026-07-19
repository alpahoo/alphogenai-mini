# High-fidelity Video Presenter bridge

## Decision

Use an AlphoGen-owned upload, consent and queue experience. A private worker
replays the normal Custom Video Avatar workflow with a persistent account-owned
browser session. Users never need a provider account and never see the provider.

This is a private-beta bridge, not a claim that an undocumented API exists. It
is justified while the official Enterprise custom-avatar API is economically
unavailable. The queue and UI are provider-neutral so the worker can later be
replaced by a commercial API or an in-house model.

## Flow

1. User chooses **Video presenter** in Product Ad.
2. User uploads performance footage and a separate consent clip directly to a
   private Supabase bucket using signed upload tokens.
3. `user_video_presenter_requests` enters `pending`.
4. The private Playwright worker claims one request, downloads both private
   files, and uses the normal Custom Avatar web flow.
5. Completion is detected from the documented custom-avatar catalog using a
   unique provider-side name.
6. The worker copies a neutral cover into `user-presenters`, creates a ready
   `user_presenters` row, and deletes the sensitive source/consent footage.
7. Product Ad polling refreshes the completed presenter automatically.

## Guardrails

- One worker, one submission at a time.
- No captcha bypass, account rotation, stealth patches or private endpoints.
- A request is claimed before browser submission.
- Existing provider name is checked before resubmission to limit duplicates.
- UI drift stops in `needs_review` and captures local diagnostics.
- Public API returns only product state; no provider name, task id or avatar id.
- Source and consent footage are private and deleted after successful publish.

## Operational gate

Before the first real request:

1. Apply `20260719_create_user_video_presenter_requests.sql` to the AlphoGen
   Supabase project.
2. Deploy the Next.js code.
3. Run `python workers/jogg_avatar/login.py` once.
4. Run `python workers/jogg_avatar/jogg_avatar_worker.py inspect` and update only
   `submit_through_web` if the live UI labels differ.
5. Submit one explicitly approved short test recording. Do not bulk-submit.

The official product steps used for this contract are: upload/record footage,
submit a consent clip, animate, then save/create. See the official guide:
https://www.jogg.ai/academy/how-to-create-custom-avatar/
