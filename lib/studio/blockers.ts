/**
 * Why Generate is disabled, as explicit reasons grouped by who can fix them:
 * - "form": the admin can fix it in the Create panel (prompt, settings, combination);
 * - "wait": temporary (status loading, a run already in progress);
 * - "owner": needs the owner (server configuration, GPU authorization, rights, budget).
 * Server reasons are the exact messages of the readiness route (`lib/comfy/gate-blockers.ts`), read
 * defensively; nothing is invented here. Applying an assistant proposal never clears an owner reason.
 */
export type BlockerKind = "form" | "wait" | "owner";
export interface StudioBlocker { kind: BlockerKind; message: string; code?: string }

const MAX_SERVER_BLOCKERS = 12;
const MAX_MESSAGE = 200;

/** Server blockers from the readiness response: strings only, bounded, never trusted as markup. */
export function parseServerBlockers(raw: unknown): { code: string; message: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((b): b is { code: string; message: string } =>
      !!b && typeof b === "object" && typeof (b as { code?: unknown }).code === "string" && typeof (b as { message?: unknown }).message === "string")
    .slice(0, MAX_SERVER_BLOCKERS)
    .map(b => ({ code: b.code.slice(0, 40), message: b.message.slice(0, MAX_MESSAGE) }));
}

export function studioBlockers(input: {
  modelAvailable: boolean;
  pendingReason?: string | null;
  readiness: { ready: boolean; loaded: boolean; reason: string; blockers?: { code: string; message: string }[] };
  activeRun: boolean;
  hasVariant: boolean;
  errors: Record<string, string>;
}): StudioBlocker[] {
  if (!input.modelAvailable) return [{ kind: "owner", message: input.pendingReason ?? "This model is not available yet." }];
  const out: StudioBlocker[] = [];
  const { readiness } = input;
  if (!readiness.loaded) out.push({ kind: "wait", message: "Checking GPU authorization…" });
  else if (!readiness.ready) {
    const server = readiness.blockers ?? [];
    if (server.length) for (const b of server) out.push({ kind: "owner", message: b.message, code: b.code });
    else out.push({ kind: "owner", message: readiness.reason || "GPU authorization pending" });
  }
  if (input.activeRun) out.push({ kind: "wait", message: "A generation is already in progress." });
  if (!input.hasVariant) out.push({ kind: "form", message: "This combination has no validated workflow. Change the settings." });
  const errKeys = Object.keys(input.errors);
  if (errKeys.length === 1 && errKeys[0] === "prompt") out.push({ kind: "form", message: input.errors.prompt });
  else if (errKeys.length) out.push({ kind: "form", message: "Fix the highlighted settings." });
  return out;
}

export const BLOCKER_GROUPS: { kind: BlockerKind; title: string }[] = [
  { kind: "form", title: "Fix in the form" },
  { kind: "wait", title: "Please wait" },
  { kind: "owner", title: "Needs owner authorization" },
];
