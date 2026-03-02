'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Job {
  id: string;
  prompt: string;
  status: string;
  current_stage: string | null;
  output_url_final: string | null;
  final_url: string | null;
  video_url: string | null;
  error_message: string | null;
}

export default function GeneratePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(60);
  const [resolution, setResolution] = useState('1080p');
  const [fps, setFps] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setJob(null);
    
    if (!prompt.trim()) {
      setError('Le prompt est requis');
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          duration_sec: duration,
          resolution: resolution === '1080p' ? '1920x1080' : '1280x720',
          fps: fps
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du job');
      }

      // Start polling on /generate (happy path V1)
      const createdJob: Job = {
        id: data.jobId,
        prompt: prompt.trim(),
        status: 'pending',
        current_stage: 'starting',
        output_url_final: null,
        final_url: null,
        video_url: null,
        error_message: null,
      };
      setJob(createdJob);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      setError(message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!job?.id) return;
    if (job.status === 'done' || job.status === 'failed') return;

    let polling: ReturnType<typeof setInterval> | null = null;

    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de la récupération du job');
        }
        const fresh: Job = data.job;
        setJob(fresh);
        setLoading(false);

        if (fresh.status === 'done' || fresh.status === 'failed') {
          if (polling) {
            clearInterval(polling);
            polling = null;
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erreur de polling';
        setError(message);
        setLoading(false);
        if (polling) {
          clearInterval(polling);
          polling = null;
        }
      }
    };

    fetchJob();
    polling = setInterval(fetchJob, 5000);

    return () => {
      if (polling) clearInterval(polling);
    };
  }, [job?.id, job?.status]);

  const finalUrl = job?.output_url_final || job?.final_url || job?.video_url || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            🎬 Générer une Vidéo
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Créez une vidéo via un seul backend (Modal en prod, Mock en local/CI)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décrivez la vidéo que vous souhaitez générer..."
              className="w-full h-32 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
              disabled={loading}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Durée
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full border-2 border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                disabled={loading}
              >
                <option value={10}>10 secondes</option>
                <option value={30}>30 secondes</option>
                <option value={60}>60 secondes</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Résolution
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full border-2 border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                disabled={loading}
              >
                <option value="720p">720p (1280x720)</option>
                <option value="1080p">1080p (1920x1080)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                FPS
              </label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full border-2 border-slate-300 dark:border-slate-600 rounded-lg p-3 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                disabled={loading}
              >
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}

          {job && (
            <div className="bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-slate-600 rounded-lg p-4 space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Job: <span className="font-mono">{job.id}</span>
              </p>
              <p className="text-sm text-slate-800 dark:text-slate-200">
                Statut: <span className="font-medium">{job.status}</span>
                {job.current_stage ? (
                  <span className="text-slate-500 dark:text-slate-400"> — {job.current_stage}</span>
                ) : null}
              </p>
              {job.status === 'failed' && job.error_message ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {job.error_message}
                </p>
              ) : null}
            </div>
          )}

          {job?.status === 'done' && finalUrl && (
            <div className="space-y-3">
              <video controls className="w-full rounded-lg shadow" src={finalUrl}>
                Votre navigateur ne supporte pas la lecture vidéo.
              </video>
              <div className="flex gap-3">
                <a
                  href={finalUrl}
                  download
                  className="flex-1 bg-blue-600 text-white text-center py-3 px-4 rounded-lg hover:bg-blue-700 transition-all font-medium"
                >
                  📥 Télécharger
                </a>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(finalUrl)}
                  className="flex-1 bg-slate-600 text-white py-3 px-4 rounded-lg hover:bg-slate-700 transition-all font-medium"
                >
                  📋 Copier le lien
                </button>
              </div>
              <button
                type="button"
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="w-full text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline"
              >
                Voir la page du job
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !prompt.trim() || (job?.status === 'in_progress' || job?.status === 'pending')}
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
                Création en cours...
              </span>
            ) : (
              job ? '⏳ En cours...' : '🎬 Générer'
            )}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline"
              disabled={loading}
            >
              ← Retour au dashboard
            </button>
          </div>
        </form>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            ℹ️ À propos
          </h3>
          <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Un seul pipeline, un seul happy path</li>
            <li>• Aucun audio pour l’instant</li>
            <li>• Stockage: Supabase bucket public “generated”</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
