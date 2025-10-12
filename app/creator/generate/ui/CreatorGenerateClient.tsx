"use client";
import { useState } from "react";

interface Scene { title: string; prompt: string; duration_s: number; idx?: number; checksum?: string }

type Step = "content" | "cast" | "storyboard" | "edit";

export default function CreatorGenerateClient() {
  const [step, setStep] = useState<Step>("content");
  const [tone, setTone] = useState("fun");
  const [topic, setTopic] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateScript = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone, topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur API");
      setScenes(data.scenes || []);
      setStep("cast");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">AI Video Generator</h1>

        {step === "content" && (
          <div className="space-y-4 bg-white dark:bg-slate-800 p-4 rounded border">
            <div className="flex gap-3">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Sujet / Titre" className="flex-1 px-3 py-2 border rounded" />
              <select value={tone} onChange={(e) => setTone(e.target.value)} className="px-3 py-2 border rounded">
                <option value="fun">fun</option>
                <option value="calm">calm</option>
                <option value="epic">epic</option>
                <option value="romantic">romantic</option>
              </select>
            </div>
            <button disabled={loading || !topic} onClick={generateScript} className="px-4 py-2 bg-blue-600 text-white rounded">
              {loading ? "Génération..." : "Générer le script"}
            </button>
            {error && <div className="text-red-600">{error}</div>}
          </div>
        )}

        {step === "cast" && (
          <div className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded border">
            <h2 className="font-semibold">Cast</h2>
            <p className="text-sm text-slate-500">Personnages cohérents à venir (placeholder).</p>
            <button onClick={() => setStep("storyboard")} className="px-4 py-2 bg-blue-600 text-white rounded">Suivant</button>
          </div>
        )}

        {step === "storyboard" && (
          <div className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded border">
            <h2 className="font-semibold mb-2">Storyboard</h2>
            <div className="space-y-2">
              {scenes.map((s, i) => (
                <div key={i} className="text-sm p-2 border rounded">
                  <div className="font-medium">{i + 1}. {s.title}</div>
                  <div className="text-slate-600">{s.prompt}</div>
                  <div className="text-xs text-slate-500">{s.duration_s}s</div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep("edit")} className="px-4 py-2 bg-blue-600 text-white rounded">Suivant</button>
          </div>
        )}

        {step === "edit" && (
          <div className="space-y-3 bg-white dark:bg-slate-800 p-4 rounded border">
            <h2 className="font-semibold mb-2">Edit</h2>
            <p className="text-sm text-slate-500">UI d'édition simplifiée (placeholder). Export et rendu à venir.</p>
            <button onClick={() => setStep("content")} className="px-4 py-2 bg-slate-200 rounded">Recommencer</button>
          </div>
        )}
      </div>
    </main>
  );
}
