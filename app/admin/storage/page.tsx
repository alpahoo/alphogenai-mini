"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  Play,
  Pause,
  Trash2,
  Copy,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type MusicTone =
  | "inspiring"
  | "synth"
  | "light"
  | "dramatic"
  | "epic"
  | "peaceful"
  | "tense"
  | "dark";

interface AudioFile {
  name: string;
  tone: MusicTone;
  publicUrl: string;
  size: number;
  created_at: string;
}

export default function AdminStoragePage() {
  const [selectedTone, setSelectedTone] = useState<MusicTone>("inspiring");
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const tones: MusicTone[] = [
    "inspiring",
    "synth",
    "light",
    "dramatic",
    "epic",
    "peaceful",
    "tense",
    "dark",
  ];

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const allFiles: AudioFile[] = [];

      for (const tone of tones) {
        const { data, error } = await supabase.storage
          .from("assets")
          .list(`music/${tone}`, {
            limit: 100,
            sortBy: { column: "name", order: "asc" },
          });

        if (error) {
          console.error(`Error listing files for ${tone}:`, error);
          continue;
        }

        if (data) {
          const toneFiles = data
            .filter((file) => file.name.endsWith(".mp3") || file.name.endsWith(".wav"))
            .map((file) => ({
              name: file.name,
              tone,
              publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/assets/music/${tone}/${file.name}`,
              size: file.metadata?.size || 0,
              created_at: file.created_at || "",
            }));
          allFiles.push(...toneFiles);
        }
      }

      setFiles(allFiles);
    } catch (error) {
      console.error("Error loading files:", error);
      showMessage("error", "Erreur lors du chargement des fichiers");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tones]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setIsUploading(true);
      setUploadProgress(0);

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const path = `music/${selectedTone}/${file.name}`;

        try {
          const { data: existingFiles } = await supabase.storage
            .from("assets")
            .list(`music/${selectedTone}`, {
              search: file.name,
            });

          if (existingFiles && existingFiles.length > 0) {
            const { error: updateError } = await supabase.storage
              .from("assets")
              .update(path, file, {
                contentType: file.type || "audio/mpeg",
                upsert: true,
              });

            if (updateError) {
              console.error(`Update error for ${file.name}:`, updateError);
              throw new Error(`Erreur mise à jour: ${updateError.message}`);
            }
          } else {
            const { error: uploadError } = await supabase.storage
              .from("assets")
              .upload(path, file, {
                contentType: file.type || "audio/mpeg",
                upsert: false,
              });

            if (uploadError) {
              console.error(`Upload error for ${file.name}:`, uploadError);
              throw new Error(`Erreur upload: ${uploadError.message}`);
            }
          }

          successCount++;
        } catch (error: any) {
          console.error(`Error uploading ${file.name}:`, error);
          showMessage("error", error.message || "Erreur inconnue");
          errorCount++;
        }

        setUploadProgress(((i + 1) / acceptedFiles.length) * 100);
      }

      setIsUploading(false);
      setUploadProgress(0);

      if (successCount > 0) {
        showMessage(
          "success",
          `✓ ${successCount} fichier(s) uploadé(s) avec succès`
        );
        await loadFiles();
      }
    },
    [selectedTone, supabase, loadFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "audio/mpeg": [".mp3"],
      "audio/wav": [".wav"],
    },
    disabled: isUploading,
  });

  const deleteFile = async (file: AudioFile) => {
    if (!confirm(`Supprimer ${file.name} ?`)) return;

    try {
      const { error } = await supabase.storage
        .from("assets")
        .remove([`music/${file.tone}/${file.name}`]);

      if (error) throw error;

      showMessage("success", `✓ ${file.name} supprimé`);
      await loadFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      showMessage("error", "Erreur lors de la suppression");
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showMessage("success", "✓ URL copiée dans le presse-papier");
    } catch (error) {
      console.error("Error copying URL:", error);
      showMessage("error", "Erreur lors de la copie");
    }
  };

  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      const audio = document.getElementById("audio-player") as HTMLAudioElement;
      audio?.pause();
      setPlayingUrl(null);
    } else {
      const audio = document.getElementById("audio-player") as HTMLAudioElement;
      if (audio) {
        audio.src = url;
        audio.play();
        setPlayingUrl(url);
      }
    }
  };

  const filteredFiles = files.filter((f) => f.tone === selectedTone);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            🎵 Audio Assets Manager
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gérez les fichiers audio pour les vidéos générées
          </p>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl shadow-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
                : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Sélectionner la catégorie
              </label>
              <select
                value={selectedTone}
                onChange={(e) => setSelectedTone(e.target.value as MusicTone)}
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              >
                {tones.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone.charAt(0).toUpperCase() + tone.slice(1)}
                  </option>
                ))}
              </select>

              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Fichiers dans cette catégorie:
                </div>
                <div className="text-3xl font-bold text-slate-900 dark:text-white">
                  {filteredFiles.length}
                </div>
              </div>

              <button
                onClick={loadFiles}
                disabled={isLoading}
                className="mt-4 w-full px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Actualiser
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div
              {...getRootProps()}
              className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-12 border-2 border-dashed transition-all cursor-pointer ${
                isDragActive
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                  : "border-slate-300 dark:border-slate-600 hover:border-orange-400 dark:hover:border-orange-500"
              } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input {...getInputProps()} />
              <div className="text-center">
                <Upload
                  className={`w-16 h-16 mx-auto mb-4 ${
                    isDragActive
                      ? "text-orange-500"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                />
                <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  {isDragActive
                    ? "Déposez les fichiers ici"
                    : "Glissez-déposez vos fichiers audio"}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                  ou cliquez pour sélectionner (.mp3, .wav)
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Les fichiers seront uploadés dans: music/{selectedTone}/
                </p>
              </div>

              {isUploading && (
                <div className="mt-6">
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-slate-600 dark:text-slate-400 mt-2">
                    Upload en cours... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Fichiers - {selectedTone.charAt(0).toUpperCase() + selectedTone.slice(1)}
          </h2>

          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 dark:text-slate-400">
                Chargement des fichiers...
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600 dark:text-slate-400 mb-2">
                Aucun fichier dans cette catégorie
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500">
                Uploadez des fichiers audio pour commencer
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredFiles.map((file) => (
                <div
                  key={file.publicUrl}
                  className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border border-slate-200 dark:border-slate-600 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate text-sm mb-1">
                        {file.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => togglePlay(file.publicUrl)}
                      className="flex-1 px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      {playingUrl === file.publicUrl ? (
                        <>
                          <Pause className="w-4 h-4" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Écouter
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => copyUrl(file.publicUrl)}
                      className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 transition-colors"
                      title="Copier l'URL"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => deleteFile(file)}
                      className="px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <audio
          id="audio-player"
          onEnded={() => setPlayingUrl(null)}
          className="hidden"
        />
      </div>
    </div>
  );
}
