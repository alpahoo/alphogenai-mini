"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_SHORT_ENGINE, SHORT_ENGINES, SHORT_MAX_SECONDS, SHORT_STARTERS, isH3ShortEngine, shortMaxSeconds, type ShortEngineId } from "@/lib/parallax-shorts";

export default function ParallaxShortsPage() {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [engine, setEngine] = useState<ShortEngineId>(DEFAULT_SHORT_ENGINE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  // H3 only: the proposed English prompt, shown for review and editing before anything is admitted.
  const [h3Draft, setH3Draft] = useState<{ prompt: string; rewritten: boolean } | null>(null);
  const router = useRouter();
  useEffect(() => { fetch("/api/modules").then((r) => r.json()).then((data) => setEnabled(Boolean(data.modules?.parallax_shorts))).catch(() => setEnabled(false)); }, []);

  if (enabled === false) return <main className="mx-auto max-w-2xl p-6"><div className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Parallax — Shorts</h1><p className="mt-2 text-muted-foreground">Ce module est désactivé par l’administrateur.</p></div></main>;

  const h3 = isH3ShortEngine(engine);
  // Any change to the idea, the engine or the duration invalidates a proposed H3 prompt.
  const changeIdea = (value: string) => { setPrompt(value); setH3Draft(null); };
  const changeDuration = (value: number) => { setDuration(value); setH3Draft(null); };

  async function prepareH3Prompt() {
    setBusy(true); setError(null);
    const response = await fetch("/api/parallax/shorts/h3-prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, target_duration_seconds: duration, engine }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.prompt !== "string") setError(data.error ?? "Impossible de préparer le prompt H3");
    else setH3Draft({ prompt: data.prompt, rewritten: data.rewritten === true });
    setBusy(false);
  }

  async function submit() {
    setBusy(true); setError(null);
    const payload = h3 && h3Draft
      ? { prompt: h3Draft.prompt.trim(), target_duration_seconds: duration, engine, prompt_ready: true }
      : { prompt, target_duration_seconds: duration, engine };
    const response = await fetch("/api/parallax/shorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Impossible de préparer le short");
    else if (typeof data.redirect === "string" && data.redirect.startsWith("/admin/studio?")) router.push(data.redirect);
    else if (data.job?.id) router.push(`/jobs/${data.job.id}`);
    else router.push("/projects");
    setBusy(false);
  }

  return <main className="mx-auto max-w-2xl space-y-6 p-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parallax</p><h1 className="text-3xl font-bold">Shorts</h1><p className="mt-2 text-muted-foreground">Créez une vidéo verticale depuis une idée, en parallèle du parcours Clipping AlphoGenAI.</p></div>
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <label className="block text-sm font-medium">Votre idée<textarea value={prompt} onChange={(e) => changeIdea(e.target.value)} maxLength={2000} rows={5} className="mt-2 w-full rounded-xl border bg-background p-3" placeholder="Ex. une démonstration très rythmée…" /></label>
      <div className="flex flex-wrap gap-2">{SHORT_STARTERS.map((starter) => <button key={starter} onClick={() => changeIdea(starter)} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">{starter}</button>)}</div>
      <div className="flex items-center gap-3"><span className="text-sm">Durée</span>{[5, SHORT_MAX_SECONDS].map((value) => <button key={value} onClick={() => changeDuration(value)} disabled={value > shortMaxSeconds(engine)} className={`rounded-lg border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${duration === value ? "border-primary bg-primary/10" : ""}`}>{value}s</button>)}<span className="text-xs text-muted-foreground">Format 9:16</span></div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Moteur de génération</legend>
        {SHORT_ENGINES.map((option) => (
          <label key={option.id} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${option.available ? "cursor-pointer" : "cursor-not-allowed opacity-50"} ${engine === option.id ? "border-primary bg-primary/10" : ""}`}>
            <input type="radio" name="short-engine" value={option.id} checked={engine === option.id} disabled={!option.available} onChange={() => { setEngine(option.id); setDuration((d) => Math.min(d, shortMaxSeconds(option.id))); setH3Draft(null); }} className="mt-1" />
            <span><span className="font-medium">{option.label}</span>{option.id === DEFAULT_SHORT_ENGINE && <span className="ml-2 text-xs text-primary">par défaut</span>}{!option.available && <span className="ml-2 text-xs">bientôt</span>}<span className="block text-xs text-muted-foreground">{option.detail}</span></span>
          </label>
        ))}
        {isH3ShortEngine(engine) && <p className="text-xs text-muted-foreground">MiniMax H3 passe par le pilote Studio (admin) : le Short s’ouvre dans le Studio, avec la correction du son et le budget du pilote.</p>}
        <p className="text-xs text-muted-foreground">Vidéo générée par IA. Temps indicatifs mesurés sur GPU H100.</p>
      </fieldset>
      {h3 && h3Draft && (
        <label className="block text-sm font-medium">Prompt MiniMax H3
          <span className="block text-xs font-normal text-muted-foreground">{h3Draft.rewritten ? "Réécrit en anglais au format H3 (scène, caméra, lumière, « Soundscape: ») à partir de votre idée. Vous pouvez le modifier avant de lancer." : "Votre texte est utilisé tel quel. Vous pouvez le modifier avant de lancer."}</span>
          <textarea value={h3Draft.prompt} onChange={(e) => setH3Draft({ ...h3Draft, prompt: e.target.value })} maxLength={2000} rows={7} className="mt-2 w-full rounded-xl border bg-background p-3 font-mono text-xs" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {h3 && !h3Draft
          ? <button onClick={prepareH3Prompt} disabled={busy || prompt.trim().length < 3} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Préparation…" : "Préparer le prompt H3"}</button>
          : <button onClick={submit} disabled={busy || (h3Draft ? h3Draft.prompt.trim().length < 3 : prompt.trim().length < 3)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Préparation…" : h3 ? "Lancer le Short" : "Préparer le Short"}</button>}
        {h3 && h3Draft && <button onClick={() => setH3Draft(null)} disabled={busy} className="rounded-xl border px-4 py-2 text-sm">Revenir à l’idée</button>}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  </main>;
}

