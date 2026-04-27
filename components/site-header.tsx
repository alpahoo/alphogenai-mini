"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Public-site header. Rendered only on marketing pages by SiteShell —
 * workspace and admin routes use their own sidebar layout.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          AlphoGen
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/about"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            About
          </Link>
          <Link
            href="/blog"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            Blog
          </Link>
          <Link
            href="/pricing"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/create"
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-all hover:brightness-110"
          >
            Create
          </Link>
        </nav>
      </div>
    </header>
  );
}
