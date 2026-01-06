'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Job {
  id: string;
  prompt: string;
  status: string;
  current_stage: string | null;
  video_url: string | null;
  output_url_final: string | null;
  final_url?: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export default function JobPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let polling: ReturnType<typeof setInterval> | null = null;

    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${params.id}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Erreur lors de la récupération du job');
        }

        setJob(data.job);
        setLoading(false);

        if (data.job.status === 'done' || data.job.status === 'failed') {
          if (polling) {
            clearInterval(polling);
            polling = null;
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Une erreur est survenue';
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
  }, [params.id]);

  const getStatusDisplay = () => {
    if (!job) return null;

    if (job.status === 'pending') {
      return (
        <div className="flex items-center gap-3">
          <div className="animate-spin h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="text-lg font-medium text-blue-600 dark:text-blue-400">
            En file d’attente...
          </span>
        </div>
      );
    }

    if (job.status === 'in_progress') {
      const stage = job.current_stage || 'processing';
      let stageText = 'Traitement en cours...';
      
      if (stage.includes('video')) {
        stageText = '🎬 Génération vidéo...';
      } else if (stage.includes('audio')) {
        stageText = '🎵 Génération audio...';
      } else if (stage.includes('mix')) {
        stageText = '🎚️ Mixage...';
      }

      return (
        <div className="flex items-center gap-3">
          <div className="animate-spin h-6 w-6 border-4 border-purple-500 border-t-transparent rounded-full"></div>
          <span className="text-lg font-medium text-purple-600 dark:text-purple-400">
            {stageText}
          </span>
        </div>
      );
    }

    if (job.status === 'done') {
      return (
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-lg font-medium text-green-600 dark:text-green-400">
            Terminé ✅
          </span>
        </div>
      );
    }

    if (job.status === 'failed') {
      return (
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <span className="text-lg font-medium text-red-600 dark:text-red-400">
            Échec ❌
          </span>
        </div>
      );
    }

    return null;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          <div className="text-center">
            <div className="h-12 w-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Erreur</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
            <button
              onClick={() => router.push('/generate')}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-all"
            >
              Retour
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Job de Génération
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            ID: {job.id}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Statut</h2>
            {getStatusDisplay()}
          </div>

          <div>
            <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Prompt</h2>
            <p className="text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-700 rounded-lg p-4">
              {job.prompt}
            </p>
          </div>

          {job.error_message && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h2 className="text-sm font-medium text-red-900 dark:text-red-100 mb-2">Message d’erreur</h2>
              <p className="text-red-600 dark:text-red-400 text-sm">
                {job.error_message}
              </p>
            </div>
          )}

          {job.status === 'done' && (job.output_url_final || job.final_url || job.video_url) && (
            <div>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">Vidéo finale</h2>
              <video
                controls
                className="w-full rounded-lg shadow-lg mb-4"
                src={(job.output_url_final || job.final_url || job.video_url) as string}
              >
                Votre navigateur ne supporte pas la lecture vidéo.
              </video>
              
              <div className="flex gap-3">
                <a
                  href={(job.output_url_final || job.final_url || job.video_url) as string}
                  download
                  className="flex-1 bg-blue-600 text-white text-center py-3 px-4 rounded-lg hover:bg-blue-700 transition-all font-medium"
                >
                  📥 Télécharger
                </a>
                <button
                  onClick={() => copyToClipboard((job.output_url_final || job.final_url || job.video_url) as string)}
                  className="flex-1 bg-slate-600 text-white py-3 px-4 rounded-lg hover:bg-slate-700 transition-all font-medium"
                >
                  📋 Copier le lien
                </button>
              </div>
            </div>
          )}

          <div className="text-center pt-4">
            <button
              onClick={() => router.push('/generate')}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline"
            >
              ← Générer une nouvelle vidéo
            </button>
          </div>
        </div>

        <div className="mt-6 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
            ℹ️ Informations
          </h3>
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <p>Créé: {new Date(job.created_at).toLocaleString('fr-FR')}</p>
            <p>Mis à jour: {new Date(job.updated_at).toLocaleString('fr-FR')}</p>
            {job.current_stage && <p>Étape: {job.current_stage}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
