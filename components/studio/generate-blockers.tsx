"use client";

import { BLOCKER_GROUPS, type StudioBlocker } from "@/lib/studio/blockers";

/**
 * Why Generate is disabled. The first reason is always visible; all of them are listed by who can fix
 * them (form, wait, owner). Messages come from the readiness route or the form checks, never invented.
 */
export function GenerateBlockers({ blockers }: { blockers: StudioBlocker[] }) {
  if (!blockers.length) return null;
  const first = blockers.find(b => b.kind === "form") ?? blockers[0];
  if (blockers.length === 1) {
    return <p role="status" className="mt-2 break-words text-center text-xs text-muted-foreground">{first.message}</p>;
  }
  return (
    <details role="status" className="group mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none break-words text-center hover:text-foreground">
        {first.message} <span className="whitespace-nowrap text-muted-foreground/70">· {blockers.length} reasons, details</span>
      </summary>
      <div className="mt-2 max-h-32 space-y-2 overflow-y-auto rounded-xl border border-border/50 bg-muted/30 p-3 text-left">
        {BLOCKER_GROUPS.map(g => {
          const items = blockers.filter(b => b.kind === g.kind);
          if (!items.length) return null;
          return (
            <div key={g.kind} data-blocker-group={g.kind}>
              <p className="font-medium text-foreground">{g.title}</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                {items.map((b, i) => <li key={`${b.code ?? g.kind}-${i}`} className="break-words">{b.message}</li>)}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
