"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SHORT_ENGINE, SHORT_ENGINES, SHORT_MAX_SECONDS, SHORT_STARTERS, type ShortEngineId } from "@/lib/parallax-shorts";

export default function ParallaxShortsPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [engine, setEngine] = useState<ShortEngineId>(DEFAULT_SHORT_ENGINE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const router = useRouter();
  useEffect(() => { fetch("/api/modules").then((r) => r.json()).then((data) => setEnabled(Boolean(data.modules?.parallax_shorts))).catch(() => setEnabled(false)); }, []);

  if (enabled === false) return <main className="mx-auto max-w-2xl p-6"><div className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Parallax — Shorts</h1><p className="mt-2 text-muted-foreground">Ce module est désactivé par l’administrateur.</p></div></main>;

  async function submit() {
    setBusy(true); setError(null);
    const response = await fetch("/api/parallax/shorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, target_duration_seconds: duration, engine }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Impossible de préparer le short");
    else if (data.job?.id) router.push(`/jobs/${data.job.id}`);
    else router.push("/projects");
    setBusy(false);
  }

  return <main className="mx-auto max-w-2xl space-y-6 p-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parallax</p><h1 className="text-3xl font-bold">Shorts</h1><p className="mt-2 text-muted-foreground">Créez une vidéo verticale depuis une idée, en parallèle du parcours Clipping AlphoGenAI.</p></div>
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <label className="block text-sm font-medium">Votre idée<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={2000} rows={5} className="mt-2 w-full rounded-xl border bg-background p-3" placeholder="Ex. une démonstration très rythmée…" /></label>
      <div className="flex flex-wrap gap-2">{SHORT_STARTERS.map((starter) => <button key={starter} onClick={() => setPrompt(starter)} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">{starter}</button>)}</div>
      <div className="flex items-center gap-3"><span className="text-sm">Durée</span>{[5, SHORT_MAX_SECONDS].map((value) => <button key={value} onClick={() => setDuration(value)} className={`rounded-lg border px-3 py-1.5 text-sm ${duration === value ? "border-primary bg-primary/10" : ""}`}>{value}s</button>)}<span className="text-xs text-muted-foreground">Format 9:16</span></div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Moteur de génération</legend>
        {SHORT_ENGINES.map((option) => (
          <label key={option.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${option.available ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${engine === option.id ? "border-primary bg-primary/10" : ""}`}>
            <input type="radio" name="short-engine" value={option.id} checked={engine === option.id} disabled={!option.available} onChange={() => setEngine(option.id)} className="mt-1" />
            <span><span className="font-medium">{option.label}</span>{option.id === DEFAULT_SHORT_ENGINE && <span className="ml-2 text-xs text-primary">par défaut</span>}{!option.available && <span className="ml-2 text-xs">bientôt</span>}<span className="block text-xs text-muted-foreground">{option.detail}</span></span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">Vidéo générée par IA. Temps indicatifs mesurés sur GPU H100.</p>
      </fieldset>
      <button onClick={submit} disabled={busy || prompt.trim().length < 3} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Préparation…" : "Préparer le Short"}</button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  </main>;
}

