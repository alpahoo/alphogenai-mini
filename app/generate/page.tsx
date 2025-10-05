"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async () => {
    // Validation
    if (!prompt || prompt.trim().length < 5) {
      setError("Veuillez entrer une description d'au moins 5 caractères");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erreur lors de la génération");
      }

      const data = await res.json();

      if (data.jobId) {
        // Rediriger vers la page vidéo (que ce soit caché ou non)
        router.push(`/v/${data.jobId}`);
      } else {
        throw new Error("Aucun jobId reçu du serveur");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-2xl">
        {/* Titre */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎬 Génère ta Vidéo IA
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Décris ton idée et laisse l'IA créer une vidéo professionnelle
          </p>
        </div>

        {/* Formulaire */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          <textarea
            className="w-full h-40 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 mb-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris ta vidéo en quelques phrases...&#10;&#10;Exemple : Un robot explique la lune à un enfant, style cinématique doux et lumineux"
            disabled={loading}
          />

          {/* Message d'erreur */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}

          {/* Bouton */}
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Génération en cours...
              </span>
            ) : (
              "🎬 Générer ma vidéo"
            )}
          </button>

          {/* Info */}
          <p className="mt-4 text-xs text-center text-slate-500 dark:text-slate-400">
            La génération prend environ 4 à 9 minutes
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>
            Propulsé par Qwen, WAN Video, ElevenLabs et Remotion
          </p>
        </div>
      </div>
    </main>
  );
}
