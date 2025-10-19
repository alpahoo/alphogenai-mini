"use client";

import { useState } from "react";

interface VideoPreviewProps {
  videoUrl: string;
  title?: string;
  isExpired?: boolean;
  storageUrl?: string;
}

export default function VideoPreview({ 
  videoUrl, 
  title = "Vidéo générée",
  isExpired = false,
  storageUrl
}: VideoPreviewProps) {
  const [showModal, setShowModal] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const handlePreviewClick = () => {
    // If video is from CloudFront and potentially expired, show warning
    if (isExpired && !storageUrl) {
      const confirmed = confirm(
        "Cette vidéo provient d'un lien temporaire qui peut avoir expiré. Voulez-vous essayer de l'ouvrir dans un nouvel onglet ?"
      );
      if (confirmed) {
        window.open(videoUrl, '_blank');
      }
      return;
    }

    // Use storage URL if available, otherwise use original URL
    const urlToUse = storageUrl || videoUrl;
    
    // Try to open in modal first
    setShowModal(true);
  };

  const handleVideoError = () => {
    setVideoError(true);
  };

  const handleOpenInNewTab = () => {
    const urlToUse = storageUrl || videoUrl;
    window.open(urlToUse, '_blank');
    setShowModal(false);
  };

  const closeModal = () => {
    setShowModal(false);
    setVideoError(false);
  };

  return (
    <>
      {/* Preview Button */}
      <button
        onClick={handlePreviewClick}
        className="inline-flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all border border-blue-200 dark:border-blue-700"
        title="Prévisualiser la vidéo"
      >
        <span className="text-lg">👁️</span>
        <span className="text-sm font-medium">Voir</span>
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenInNewTab}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  title="Ouvrir dans un nouvel onglet"
                >
                  <span className="text-sm">🔗 Nouvel onglet</span>
                </button>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-all flex items-center justify-center"
                  title="Fermer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Video Content */}
            <div className="p-6">
              {videoError ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">⚠️</div>
                  <h4 className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
                    Impossible de charger la vidéo
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 mb-4">
                    {isExpired 
                      ? "Le lien temporaire a peut-être expiré. La vidéo est maintenant stockée de manière permanente."
                      : "Une erreur s'est produite lors du chargement de la vidéo."
                    }
                  </p>
                  <button
                    onClick={handleOpenInNewTab}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    Essayer dans un nouvel onglet
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <video
                    src={storageUrl || videoUrl}
                    controls
                    autoPlay
                    loop
                    muted
                    onError={handleVideoError}
                    className="w-full max-h-[60vh] rounded-lg bg-black"
                    preload="metadata"
                  >
                    Votre navigateur ne supporte pas la lecture vidéo.
                  </video>
                  
                  {/* Video Info */}
                  <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-slate-600 dark:text-slate-400">
                        {storageUrl ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                            Vidéo stockée de manière permanente
                          </span>
                        ) : isExpired ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                            Lien temporaire (peut expirer)
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            Lien temporaire
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 dark:text-slate-500">
                        Durée: 10s • 720p
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Utility function to determine if a URL is from CloudFront (temporary)
export function isCloudFrontUrl(url: string): boolean {
  return url.includes('cloudfront.net') || url.includes('runway');
}

// Utility function to determine if a URL is from Supabase Storage (permanent)
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('supabase') && url.includes('/storage/');
}