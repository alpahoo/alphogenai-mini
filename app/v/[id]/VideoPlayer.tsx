"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Job {
  id: string;
  prompt: string;
  status: string;
  current_stage: string | null;
  error_message: string | null;
  final_url: string | null;
  video_url: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoPlayerProps {
  initialJob: Job;
}

export default function VideoPlayer({ initialJob }: VideoPlayerProps) {
  const [job, setJob] = useState<Job>(initialJob);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  // Polling pour les jobs en cours
  useEffect(() => {
    const isDone = job.status === "done";
    
    if (isDone || job.status === "failed" || job.status === "cancelled") {
      setPolling(false);
      return;
    }

    // Démarrer le polling
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        if (res.ok) {
          const data = await res.json();
          // /api/jobs/[id] returns { success, job }
          setJob(data.job ?? data);
          
          // Arrêter le polling si terminé
          const status = (data.job ?? data).status;
          if (status === "done" || status === "failed") {
            setPolling(false);
            clearInterval(interval);
            router.refresh();
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 8000); // Poll toutes les 8 secondes

    return () => clearInterval(interval);
  }, [job.id, job.status, router]);

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isDone = job.status === "done";
  const videoUrl = job.final_url || job.video_url;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            🎥 Votre Vidéo
          </h1>
          <p className="text-slate-600 dark:text-slate-400">{job.prompt}</p>
        </div>

        {/* Contenu principal */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
          {isDone && videoUrl ? (
            // Vidéo prête
            <div>
              <div className="aspect-video bg-black">
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-full"
                  poster="/placeholder-video.jpg"
                >
                  Votre navigateur ne supporte pas la lecture vidéo.
                </video>
              </div>

              {/* Actions */}
              <div className="p-6 space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-4 py-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
                  >
                    {copied ? "✅ Copié!" : "📋 Copier le lien"}
                  </button>
                  <a
                    href={videoUrl}
                    download
                    className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors text-center font-medium"
                  >
                    💾 Télécharger
                  </a>
                </div>

                <a
                  href="/generate"
                  className="block w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all text-center font-medium"
                >
                  ✨ Créer une autre vidéo
                </a>
              </div>
            </div>
          ) : isDone && !videoUrl ? (
            // Status done mais pas de vidéo encore
            <div className="p-12 text-center">
              <div className="mb-6">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold mb-2">
                  Rendu final en cours...
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  La vidéo est presque prête, réessayez dans un instant
                </p>
              </div>
            </div>
          ) : job.status === "failed" ? (
            // Erreur
            <div className="p-12 text-center">
              <div className="mb-6">
                <div className="text-6xl mb-4">❌</div>
                <h2 className="text-xl font-semibold mb-2 text-red-600 dark:text-red-400">
                  Erreur de génération
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {job.error_message || "Une erreur est survenue lors de la génération"}
                </p>
                <a
                  href="/generate"
                  className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  🔄 Réessayer
                </a>
              </div>
            </div>
          ) : (
            // En cours de génération
            <div className="p-12 text-center">
              <div className="mb-6">
                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
                <h2 className="text-xl font-semibold mb-2">
                  ⏳ Génération en cours...
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  {job.current_stage
                    ? `Étape actuelle : ${job.current_stage}`
                    : "Traitement de votre demande"}
                </p>
                {polling && (
                  <p className="text-sm text-slate-500 dark:text-slate-500">
                    🔄 Actualisation automatique toutes les 8 secondes
                  </p>
                )}
              </div>

              {/* Barre de progression estimée */}
              <div className="max-w-md mx-auto mb-6">
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600 rounded-full transition-all duration-1000 animate-pulse"
                    style={{ width: getProgressWidth(job.current_stage) }}
                  ></div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                  Temps estimé : 4 à 9 minutes
                </p>
              </div>

              {/* Info */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  💡 Vous pouvez fermer cette page et revenir plus tard.
                  Le lien restera accessible.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isDone && (
          <div className="mt-6 text-center">
            <a
              href="/generate"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            >
              ← Retour au formulaire
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

// Helper pour calculer la largeur de la barre de progression
function getProgressWidth(stage: string | null): string {
  if (!stage) return "10%";
  
  const stageProgress: Record<string, string> = {
    starting: "10%",
    qwen_script: "20%",
    generate_script: "20%",
    wan_image: "35%",
    generate_key_visual: "35%",
    video_clips: "50%",
    pika_clips: "50%",
    generate_clips: "50%",
    elevenlabs_audio: "70%",
    generate_audio: "70%",
    remotion_assembly: "85%",
    assemble_video: "85%",
    completed: "100%",
  };

  return stageProgress[stage] || "50%";
}
