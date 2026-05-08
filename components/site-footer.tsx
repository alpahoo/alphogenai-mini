import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Public-site footer. Rendered only on marketing pages by SiteShell.
 *
 * 3-column layout on desktop (brand · product · legal), stacked on mobile.
 * Bottom row centers the copyright + "Made in France" tagline.
 *
 * No fake metrics, no marketing fluff — keep it credible.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-border/50 bg-background/60">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {/* Brand column */}
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              AlphoGen
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              AI-powered video generation
            </p>
          </div>

          {/* Product column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Product
            </h3>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                href="/about"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                About
              </Link>
              <Link
                href="/technology"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Technology
              </Link>
              <Link
                href="/pricing"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </Link>
              <Link
                href="/create"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Create
              </Link>
            </nav>
          </div>

          {/* Legal column */}
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              Legal
            </h3>
            <nav className="flex flex-col gap-2 text-sm">
              <Link
                href="/privacy"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Terms
              </Link>
              <a
                href="mailto:ai@alphogen.com"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                ai@alphogen.com
              </a>
            </nav>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-10 flex flex-col items-center gap-2 border-t border-border/40 pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p>© 2026 AlphoGen — Building the future of AI video</p>
          <p>Made in France 🇫🇷</p>
        </div>
      </div>
    </footer>
  );
}
