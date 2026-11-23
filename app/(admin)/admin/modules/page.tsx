"use client";

import { useEffect, useState } from "react";
import { Loader2, Power } from "lucide-react";

const MODULES = [
  ["alphogenai_clipping", "AlphoGenAI — Clipping", "Parcours existant : extraire des clips"],
  ["parallax_shorts", "Parallax — Shorts", "Nouveau : vidéo verticale depuis une idée"],
  ["alphogenai_podcast", "AlphoGenAI — Podcast Studio", "Parcours existant : épisodes"],
  ["parallax_audio", "Parallax — Audio", "Nouveau : Texte → Voix et Musique"],
  ["parallax_remix", "Parallax — Remix", "Nouveau : réutiliser une référence vidéo"],
] as const;

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { fetch("/api/admin/modules").then((r) => r.json()).then((data) => setModules(data.modules ?? {})); }, []);
  async function toggle(module: string) {
    setBusy(module);
    const response = await fetch("/api/admin/modules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module, enabled: !modules[module] }) });
    const data = await response.json();
    if (response.ok) setModules(data.modules);
    setBusy(null);
  }
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Parcours et modules</h1><p className="text-sm text-muted-foreground">Les parcours AlphoGenAI restent séparés des variantes Parallax. Seuls les admins peuvent modifier ces réglages.</p></div><div className="rounded-xl border border-border/40 bg-card/60 divide-y divide-border/20">{MODULES.map(([id, label, description]) => { const enabled = modules[id] ?? false; return <div key={id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{description}</p></div><button onClick={() => toggle(id)} disabled={busy === id} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${enabled ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-zinc-600/30 text-zinc-400"}`}>{busy === id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}{enabled ? "Activé" : "Désactivé"}</button></div>; })}</div></div>;
}

