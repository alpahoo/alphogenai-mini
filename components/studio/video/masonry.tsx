"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Adapted from Parallax (MIT, Copyright (c) 2026 Nick Vasilescu), commit a98671e3c47fdb12c42789aee821268aa8f23f6c,
 * src/components/video/masonry.tsx. Differences: none in behaviour; the class names use the Studio's theme.
 * See ./LICENSE-parallax.txt.
 */
const QUERIES = ["(min-width: 1280px)", "(min-width: 640px)"] as const;

function columns(): number {
  if (window.matchMedia(QUERIES[0]).matches) return 3;
  if (window.matchMedia(QUERIES[1]).matches) return 2;
  return 1;
}

function subscribe(on: () => void) {
  const lists = QUERIES.map(q => window.matchMedia(q));
  lists.forEach(l => l.addEventListener("change", on));
  return () => lists.forEach(l => l.removeEventListener("change", on));
}

/** The gallery's columns: three on a wide screen, two on a tablet, one on a phone. Items are dealt left to right. */
export function Masonry({ label, items, className }: { label: string; items: { key: string; node: ReactNode }[]; className?: string }) {
  const count = useSyncExternalStore(subscribe, columns, () => 2);
  const cols = Array.from({ length: count }, (_, c) => items.filter((_, i) => i % count === c));
  return (
    <div aria-label={label} role="region" className={`mx-auto flex w-full max-w-[1022px] items-start gap-3 ${className ?? ""}`}>
      {cols.map((col, c) => (
        <ul key={c} className="flex min-w-0 flex-1 flex-col gap-3">
          {col.map(item => <li key={item.key}>{item.node}</li>)}
        </ul>
      ))}
    </div>
  );
}
