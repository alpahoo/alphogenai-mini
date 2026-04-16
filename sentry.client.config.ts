// Sentry client-side configuration
// Only initializes if NEXT_PUBLIC_SENTRY_DSN is set
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1, // 10% of transactions
    replaysOnErrorSampleRate: 1.0, // Record replay on error
    replaysSessionSampleRate: 0, // Don't record normal sessions
    environment: process.env.NODE_ENV,
  });
}
