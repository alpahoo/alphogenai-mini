// Next.js instrumentation — runs once on server start
// Loads the correct Sentry config based on runtime (Node vs Edge)
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures unhandled errors in React Server Components and route handlers
export const onRequestError = Sentry.captureRequestError;
