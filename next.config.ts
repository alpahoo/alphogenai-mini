import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  transpilePackages: ["lucide-react"],
  // Montage (app/api/admin/studio/montages): ffmpeg runs from the binary installed by `ffmpeg-static`. The package
  // stays external (its path is resolved at runtime) and the binary is added to that route's serverless bundle.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/admin/studio/montages": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { remotion: "remotion" }];
    return config;
  },
};

// Always wrap with Sentry — init files check DSN at runtime.
// NOTE: `disableLogger` was removed in @sentry/nextjs v10. Default behaviour
// already tree-shakes debug logs in production, so no replacement is needed.
// NOTE: `hideSourceMaps` was also removed — production source maps are
// already hidden by default in v10.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
