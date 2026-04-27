import Link from "next/link";

/**
 * Public-site footer. Rendered only on marketing pages by SiteShell.
 * Minimal by design — no fake metrics, no marketing fluff.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-border/50 bg-background/60">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            © 2026 AlphoGen — Building the future of AI video
          </p>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link
              href="/about"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              About
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
            <a
              href="mailto:contact@alphogen.com"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contact
            </a>
          </nav>
        </div>

        <p className="mt-4 text-xs text-muted-foreground/70">
          Made in France 🇫🇷
        </p>
      </div>
    </footer>
  );
}
