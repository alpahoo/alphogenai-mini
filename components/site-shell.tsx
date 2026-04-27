"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

/**
 * Wraps marketing pages with header + footer.
 *
 * Workspace, admin, login, and auth routes have their own dedicated
 * layouts (sidebar / no-chrome) — those bypass SiteShell entirely so
 * the marketing chrome doesn't leak into the app surface.
 *
 * Allowlist (rather than blocklist) keeps it safe: any unknown route
 * defaults to bare children, never accidentally injects a marketing
 * header into a logged-in workspace screen.
 */
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/about",
  "/pricing",
  "/privacy",
  "/terms",
  "/blog",
]);

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Blog has dynamic /blog/[slug] children — match those too without
  // listing each slug in the Set.
  const showChrome =
    PUBLIC_PATHS.has(pathname) || pathname.startsWith("/blog/");

  if (!showChrome) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
