"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const MODULES = [
  ["alphogenai_clipping", "AlphoGenAI — Clipping", "Parcours existant : extraire des clips"],
  ["parallax_shorts", "Parallax — Shorts", "Nouveau : vidéo verticale depuis une idée"],
  ["alphogenai_podcast", "AlphoGenAI — Podcast Studio", "Parcours existant : épisodes"],
  ["parallax_audio", "Parallax — Audio", "Nouveau : brouillon vocal (Podcast Studio) ; la musique n’est pas raccordée"],
  ["parallax_remix", "Parallax — Remix", "Nouveau : réutiliser une vidéo terminée comme référence"],
] as const;

type Mode = boolean | "admin";
const OPTIONS: ReadonlyArray<readonly [Mode, string]> = [[false, "Désactivé"], ["admin", "Admin seul"], [true, "Activé"]];

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Record<string, Mode>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/admin/modules").then((r) => r.json()).then((data) => setModules(data.modules ?? {})).catch(() => setError("Réglages illisibles")); }, []);
  async function choose(module: string, mode: Mode) {
    setBusy(module); setError(null);
    const response = await fetch("/api/admin/modules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, mode }) });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setModules(data.modules); else setError(data.error ?? "Enregistrement impossible");
    setBusy(null);
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Parcours et modules</h1><p className="text-sm text-muted-foreground">Les parcours AlphoGenAI restent séparés des variantes Parallax. « Admin seul » rend le module visible et utilisable par les administrateurs uniquement. Seuls les admins peuvent modifier ces réglages.</p></div>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<div className="rounded-xl border border-border/40 bg-card/60 divide-y divide-border/20">{MODULES.map(([id, label, description]) => { const current: Mode = modules[id] ?? false; return <div key={id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div><div role="group" aria-label={label} className="flex items-center gap-1">{busy === id && <Loader2 className="h-3 w-3 animate-spin" />}{OPTIONS.map(([mode, text]) => <button key={String(mode)} type="button" aria-pressed={current === mode} onClick={() => choose(id, mode)} disabled={busy === id} className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${current === mode ? (mode === true ? "border-green-500/40 bg-green-500/15 text-green-700 dark:text-green-300" : mode === "admin" ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-zinc-500/40 bg-zinc-500/15 text-foreground") : "border-border/40 text-muted-foreground"}`}>{text}</button>)}</div></div>; })}</div></div>;
}
