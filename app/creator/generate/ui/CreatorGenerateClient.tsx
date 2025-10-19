"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type GenerationMode = "t2v" | "i2v";

interface CreatorGenerateClientProps {
  isAdmin: boolean;
  onCancelAllJobs: () => Promise<void>;
  onViewJobs: () => void;
}

export default function CreatorGenerateClient({
  isAdmin,
  onCancelAllJobs,
  onViewJobs,
}: CreatorGenerateClientProps) {
  const [prompt, setPrompt] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("t2v");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleModeChange = (mode: GenerationMode) => {
    setGenerationMode(mode);
    if (mode === "t2v") {
      // Clear image when switching to text mode
      setImageFile(null);
      setImagePreview(null);
    }
    setError(null);
  };

  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Veuillez sélectionner un fichier image valide");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("L'image ne doit pas dépasser 10MB");
      return;
    }

    setImageFile(file);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImageToSupabase = async (file: File): Promise<string> => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error("Utilisateur non authentifié");
    }

    // Generate unique filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `${user.id}/${timestamp}_ref.${extension}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('casts')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      throw new Error(`Erreur d'upload: ${error.message}`);
    }

    // Get signed URL (valid for 24 hours)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('casts')
      .createSignedUrl(filename, 86400);

    if (signedError) {
      throw new Error(`Erreur de génération d'URL: ${signedError.message}`);
    }

    return signedData.signedUrl;
  };

  const handleGenerate = async () => {
    // Validation
    if (!prompt || prompt.trim().length < 5) {
      setError("Veuillez entrer une description d'au moins 5 caractères");
      return;
    }

    if (generationMode === "i2v" && !imageFile) {
      setError("Veuillez sélectionner une image de référence pour le mode Image → Vidéo");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let imageRefUrl: string | null = null;

      // Upload image if in i2v mode
      if (generationMode === "i2v" && imageFile) {
        setUploadingImage(true);
        imageRefUrl = await uploadImageToSupabase(imageFile);
        setUploadingImage(false);
      }

      // Generate video
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          generation_mode: generationMode,
          image_ref_url: imageRefUrl
        }),
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
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-3xl">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          🎬 Génère ta Vidéo IA
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Crée une vidéo à partir d'un texte ou d'une image de référence
        </p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 mb-6">
        {/* Mode Selection Toggle */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Mode de génération
          </label>
          <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
            <button
              type="button"
              onClick={() => handleModeChange("t2v")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                generationMode === "t2v"
                  ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              📝 Texte → Vidéo
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("i2v")}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                generationMode === "i2v"
                  ? "bg-white dark:bg-slate-600 text-purple-600 dark:text-purple-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
            >
              🖼️ Image → Vidéo
            </button>
          </div>
        </div>

        {/* Image Upload (only in i2v mode) */}
        {generationMode === "i2v" && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Image de référence
            </label>
            
            {!imagePreview ? (
              <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center">
                <div className="mb-4">
                  <svg className="mx-auto h-12 w-12 text-slate-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Cliquez pour sélectionner une image
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  PNG, JPG, WEBP jusqu'à 10MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-4 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all"
                >
                  Choisir une image
                </button>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Image de référence"
                  className="w-full max-h-64 object-contain rounded-lg border border-slate-200 dark:border-slate-600"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-all"
                >
                  ✕
                </button>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {imageFile?.name} ({Math.round((imageFile?.size || 0) / 1024)} KB)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Prompt Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            {generationMode === "t2v" ? "Description de la vidéo" : "Description du mouvement"}
          </label>
          <textarea
            className="w-full h-32 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              generationMode === "t2v"
                ? "Décris ta vidéo en quelques phrases...\n\nExemple : Un robot explique la lune à un enfant, style cinématique doux et lumineux"
                : "Décris comment l'image doit s'animer...\n\nExemple : Le robot bouge lentement ses bras, la caméra fait un zoom avant doux"
            }
            disabled={loading}
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm">
              ⚠️ {error}
            </p>
          </div>
        )}

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim() || (generationMode === "i2v" && !imageFile)}
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
              {uploadingImage ? "Upload de l'image..." : "Génération en cours..."}
            </span>
          ) : (
            <>
              {generationMode === "t2v" ? "🎬 Générer ma vidéo" : "🎨 Animer mon image"}
            </>
          )}
        </button>

        {/* Mode Info */}
        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {generationMode === "t2v" ? (
              <>
                <strong>Mode Texte → Vidéo :</strong> Génère une vidéo complète à partir de votre description textuelle
              </>
            ) : (
              <>
                <strong>Mode Image → Vidéo :</strong> Anime votre image de référence selon votre description du mouvement
              </>
            )}
          </div>
        </div>
      </div>

      {/* Admin Controls */}
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
              onClick={onViewJobs}
              className="flex items-center justify-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium py-3 px-4 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all border border-blue-300 dark:border-blue-700"
            >
              <span className="text-lg">📊</span>
              Voir tous les jobs
            </button>

            <button
              onClick={onCancelAllJobs}
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
  );
}