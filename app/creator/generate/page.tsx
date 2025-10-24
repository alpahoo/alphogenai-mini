"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [reuseMode, setReuseMode] = useState(false);
  const [sourceJobId, setSourceJobId] = useState("");
  const [previousJobs, setPreviousJobs] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/auth/login');
        return;
      }
      
      setIsAuthenticated(true);
      const adminStatus = user?.user_metadata?.role === 'admin';
      setIsAdmin(adminStatus);
      setCheckingAuth(false);
      
      if (adminStatus) {
        fetchPreviousJobs();
      }
    }
    
    async function fetchPreviousJobs() {
      try {
        const supabase = createClient();
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, prompt, created_at, status, app_state')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(20);
        
        const jobsWithAssets = jobs?.filter(job => 
          job.app_state?.runway_tasks && 
          Object.keys(job.app_state.runway_tasks).length > 0
        ) || [];
        
        setPreviousJobs(jobsWithAssets);
      } catch (err) {
        console.error('Failed to fetch previous jobs:', err);
      }
    }
    
    checkAuth();
  }, [router]);

  const handleGenerate = async () => {
    if (!prompt || prompt.trim().length < 5) {
      setError("Veuillez entrer une description d'au moins 5 caractères");
      return;
    }

    if (reuseMode && !sourceJobId) {
      setError("Veuillez sélectionner un job source pour réutiliser les assets");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const requestBody: any = { prompt: prompt.trim() };
      if (reuseMode && sourceJobId) {
        requestBody.source_job_id = sourceJobId;
      }
      
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  const handleCancelAllJobs = async () => {
    if (!confirm("Annuler TOUS les jobs en cours ?")) return;
    
    try {
      const res = await fetch("/api/admin/cancel-all-jobs", {
        method: "POST",
      });
      await res.json();
      alert("Jobs annulés");
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleViewJobs = () => {
    router.push("/admin/jobs");
  };

  if (checkingAuth) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div>Vérification de l'authentification...</div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎬 Génère ta Vidéo IA
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Décris ton idée et laisse l'IA créer une vidéo professionnelle
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
          {isAdmin && (
            <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reuseMode}
                  onChange={(e) => setReuseMode(e.target.checked)}
                  className="w-5 h-5 text-orange-600 bg-white dark:bg-slate-700 border-orange-300 dark:border-orange-700 rounded focus:ring-orange-500"
                  disabled={loading}
                />
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  ♻️ Réutiliser des assets existants (admin uniquement)
                </span>
              </label>
              
              {reuseMode && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Choisir un job précédent :
                  </label>
                  <select
                    value={sourceJobId}
                    onChange={(e) => setSourceJobId(e.target.value)}
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    disabled={loading}
                  >
                    <option value="">-- Sélectionner un job --</option>
                    {previousJobs.map(job => {
                      const sceneCount = Object.keys(job.app_state?.runway_tasks || {}).length;
                      return (
                        <option key={job.id} value={job.id}>
                          {job.prompt.substring(0, 60)}... ({sceneCount} scènes) - {new Date(job.created_at).toLocaleDateString()}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    ⚠️ Le nombre de scènes doit correspondre exactement au job source
                  </p>
                </div>
              )}
            </div>
          )}
          
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
            disabled={loading || !prompt.trim() || (reuseMode && !sourceJobId)}
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
            ) : reuseMode ? (
              "♻️ Réutiliser et assembler"
            ) : (
              "🎬 Générer ma vidéo"
            )}
          </button>
        </div>

        {isAdmin && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border-2 border-orange-200 dark:border-orange-800">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">⚙️</span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Contrôle Admin
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                onClick={handleViewJobs}
                className="flex items-center justify-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium py-3 px-4 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all border border-blue-300 dark:border-blue-700"
              >
                <span className="text-lg">📊</span>
                Voir tous les jobs
              </button>

              <button
                onClick={handleCancelAllJobs}
                className="flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium py-3 px-4 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-all border border-red-300 dark:border-red-700"
              >
                <span className="text-lg">🛑</span>
                Annuler tous
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>
            🎥 Runway Gen-4 Turbo | 🎵 Musiques libres | ⏱️ Temps : ~2-3 minutes
          </p>
        </div>
      </div>
    </main>
  );
}
