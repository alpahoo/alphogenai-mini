"use client";

/** Adapted from nickvasilescu/parallax@a98671e3c47fdb12c42789aee821268aa8f23f6c (MIT). */
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Tab = "voice" | "music" | "history";

export default function ParallaxAudioPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("voice");
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [message, setMessage] = useState("");
  const loadHistory = async () => { const response = await fetch("/api/podcasts?limit=12"); if (response.ok) setHistory((await response.json()).podcasts ?? []); };
  useEffect(() => { fetch("/api/modules").then((r) => r.json()).then((data) => setEnabled(Boolean(data.modules?.parallax_audio))).catch(() => setEnabled(false)); void loadHistory(); }, []);
  const prepareVoice = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim()) return; setMessage("");
    const response = await fetch("/api/podcasts", { method: "POST", headers: { "content-type": "application/json", "x-alphogen-module": "parallax_audio" }, body: JSON.stringify({ source_mode: "generate", source_topic: text.trim(), title: `Parallax Audio — ${text.trim().slice(0, 48)}`, language: "fr-FR" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setMessage(data.error || "Le studio n’a pas pu préparer le job."); else { setMessage("Brouillon vocal préparé dans l’historique privé."); setText(""); await loadHistory(); }
  };
  if (enabled === false) return <main className="mx-auto max-w-2xl p-6"><div className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Parallax — Audio désactivé</h1><p className="mt-2 text-muted-foreground">Un administrateur doit réactiver ce module pour démarrer une action.</p></div></main>;
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parallax · Audio Studio</p><h1 className="text-3xl font-bold">Créer du son</h1><p className="mt-2 text-muted-foreground">Texte → Voix et Musique coexistent avec le Podcast Studio AlphoGenAI.</p></div>
    <div className="flex gap-2 border-b pb-2">{([['voice','Texte → Voix'],['music','Musique'],['history','Historique']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? 'bg-primary text-primary-foreground' : 'border'}`}>{label}</button>)}</div>
    {tab === "voice" && <form onSubmit={prepareVoice} className="space-y-4 rounded-2xl border p-5"><label className="block text-sm font-semibold">Texte ou idée<input value={text} onChange={(e) => setText(e.target.value)} className="mt-2 w-full rounded-xl border p-3" placeholder="Une intro calme sur la photographie…" /></label><div className="flex flex-wrap gap-3"><button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">Préparer un brouillon vocal</button><Link className="rounded-xl border px-4 py-2 text-sm font-semibold" href="/create/podcast">Ouvrir Podcast Studio</Link></div>{message && <p className="text-sm text-muted-foreground">{message}</p>}</form>}
    {tab === "music" && <section className="rounded-2xl border p-5"><h2 className="font-semibold">Musique</h2><p className="mt-2 text-sm text-muted-foreground">L’onglet est disponible, mais aucun endpoint utilisateur compatible n’est actuellement raccordé à un moteur autorisé. La génération reste donc indisponible sans activer un moteur et son contrôle de quota.</p><Link className="mt-4 inline-block rounded-xl border px-4 py-2 text-sm font-semibold" href="/library">Voir la bibliothèque audio</Link></section>}
    {tab === "history" && <section className="space-y-3">{history.length === 0 ? <p className="rounded-2xl border p-5 text-sm text-muted-foreground">Aucun résultat privé dans cet historique.</p> : history.map((item) => <div key={item.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{item.title}</span><span className="text-xs text-muted-foreground">{item.status}</span></div></div>)}</section>}
  </main>;
}

