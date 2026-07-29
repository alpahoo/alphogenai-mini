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
The VPS owns queueing and Revideo rendering; GPU generation remains on BytePlus,
Modal GPU, or another provider implementing `UGCShotProvider`.

The final production service should:

1. accept a signed AlphoGen render request;
2. download or reference the three permanent MP4 shots;
3. call Revideo with the supplied manifest;
4. upload the final MP4 to R2;
5. notify AlphoGen with the resulting permanent URL.

Never expose the raw Revideo render endpoint publicly without authentication and
per-user quotas.
