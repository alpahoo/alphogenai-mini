import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lucide-react'],
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { remotion: 'remotion' }];
    return config;
  },
};

// Only wrap with Sentry if DSN is configured
const useSentry = !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN);

export default useSentry
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
      silent: !process.env.CI,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;
