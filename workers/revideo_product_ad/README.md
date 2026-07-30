# AlphoGen Revideo Product Ad worker

This worker assembles exactly three full-screen UGC clips. It does not generate
media and contains no provider credentials. The AlphoGen application supplies a
parameterized edit manifest after the shot provider has produced permanent MP4s.

## Local render

```bash
npm install
npm run render -- --manifest ./manifest.json --output product-ad.mp4
```

## Hostinger deployment

Run the Docker image behind a private network or an authenticated reverse proxy.
The service exposes:

- `GET /health`
- `POST /render` with `Authorization: Bearer $REVIDEO_WORKER_SECRET`
- `GET /status/:requestId` with the same authorization

It queues one render at a time and uploads completed MP4 files directly to R2.
Required environment variables are `REVIDEO_WORKER_SECRET`, `R2_ENDPOINT`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` and
`R2_PUBLIC_URL`. GPU generation remains on BytePlus, Modal GPU, or another
provider implementing `UGCShotProvider`.

Never expose the raw Revideo render endpoint publicly without authentication and
per-user quotas.
