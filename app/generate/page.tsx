"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleGenerate = async () => {
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
        router.push(`/v/${data.jobId}`);
      } else {
        throw new Error("Aucun jobId reçu du serveur");
      }
    } catch (err: any) {
      setError(err.message || "Une erreur est survenue");
      setLoading(false);
    }
  };

  // FONCTIONS ADMIN
  const handleCancelAllJobs = async () => {
    if (!confirm("Annuler TOUS les jobs en cours ?")) return;
    
    setAdminLoading(true);
    setAdminMessage(null);
    
    try {
      const res = await fetch("/api/admin/cancel-all-jobs", {
        method: "POST",
      });
      const data = await res.json();
      setAdminMessage(`✅ ${data.cancelled || 0} job(s) annulé(s)`);
    } catch (err: any) {
      setAdminMessage(`❌ Erreur: ${err.message}`);
    } finally {
      setAdminLoading(false);
    }
  };

  const handleViewJobs = () => {
    router.push("/admin/jobs");
  };

  const handleViewLogs = () => {
    window.open("https://dashboard.render.com", "_blank");
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-3xl">
        {/* Titre */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎬 Génère ta Vidéo IA
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Décris ton idée et laisse l'IA créer une vidéo professionnelle
          </p>
        </div>

        {/* Formulaire Principal */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
          <textarea
            className="w-full h-40 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 mb-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Décris ta vidéo en quelques phrases...&#10;&#10;Exemple : Un robot explique la lune à un enfant, style cinématique doux et lumineux"
            disabled={loading}
          />

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}

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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Génération en cours...
              </span>
            ) : (
              "🎬 Générer ma vidéo"
            )}
          </button>
        </div>

        {/* ADMIN PANEL - VISIBLE DIRECTEMENT */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border-2 border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl">⚙️</span>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Contrôle Admin
            </h2>
          </div>

          {adminMessage && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-blue-600 dark:text-blue-400 text-sm">
                {adminMessage}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Bouton Voir Jobs */}
            <button
              onClick={handleViewJobs}
              className="flex items-center justify-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium py-3 px-4 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all border border-blue-300 dark:border-blue-700"
            >
              <span className="text-lg">📊</span>
              Voir tous les jobs
            </button>

            {/* Bouton Annuler Tous */}
            <button
              onClick={handleCancelAllJobs}
              disabled={adminLoading}
              className="flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium py-3 px-4 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all border border-red-300 dark:border-red-700 disabled:opacity-50"
            >
              <span className="text-lg">🛑</span>
              {adminLoading ? "..." : "Annuler tous"}
            </button>

            {/* Bouton Logs Render */}
            <button
              onClick={handleViewLogs}
              className="flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-3 px-4 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all border border-slate-300 dark:border-slate-600"
            >
              <span className="text-lg">📝</span>
              Logs Render
            </button>
          </div>

          <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <p className="text-orange-700 dark:text-orange-300 text-xs">
              ℹ️ Retries automatiques <strong>DÉSACTIVÉS</strong> - Contrôle manuel requis
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>
            💰 Coût par vidéo : ~$0.57 | ⏱️ Temps : ~2 minutes
          </p>
        </div>
      </div>
    </main>
  );
}
