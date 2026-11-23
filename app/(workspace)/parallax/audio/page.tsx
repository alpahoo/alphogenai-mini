"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function ParallaxAudioPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/modules").then((r) => r.json()).then((data) => setEnabled(Boolean(data.modules?.parallax_audio))).catch(() => setEnabled(false)); }, []);
  if (enabled === false) return <main className="mx-auto max-w-2xl p-6"><div className="rounded-2xl border p-6"><h1 className="text-2xl font-bold">Parallax — Audio désactivé</h1><p className="mt-2 text-muted-foreground">Un administrateur doit réactiver ce module pour y accéder.</p></div></main>;
  return <main className="mx-auto max-w-3xl space-y-6 p-6">
    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parallax</p><h1 className="text-3xl font-bold">Audio</h1><p className="mt-2 text-muted-foreground">Deux parcours parallèles pour explorer Texte → Voix et Musique.</p></div>
    <div className="grid gap-4 md:grid-cols-2"><section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Texte → Voix</h2><p className="mt-2 text-sm text-muted-foreground">Utilisez le studio Podcast AlphoGenAI pour préparer un épisode et retrouver son historique privé.</p><Link className="mt-4 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/create/podcast">Ouvrir le studio Podcast</Link></section><section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Musique</h2><p className="mt-2 text-sm text-muted-foreground">Le parcours est exposé côte à côte. La génération reste soumise aux moteurs et quotas déjà autorisés par AlphoGenAI.</p><Link className="mt-4 inline-block rounded-xl border px-4 py-2 text-sm font-semibold" href="/library">Voir la bibliothèque audio</Link></section></div>
  </main>;
}

