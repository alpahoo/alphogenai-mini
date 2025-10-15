"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import VideoCard from "../(components)/VideoCard";

interface Project {
  id: string;
  title: string | null;
  prompt: string;
  status: string;
  model: string;
  cost_credits: number;
  final_video_path: string | null;
  thumbnail_path: string | null;
  youtube_video_id: string | null;
  created_at: string;
}

export default function AssetsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"created_at" | "cost_credits">("created_at");
  const router = useRouter();

  useEffect(() => {
    async function checkAuthAndLoadProjects() {
      const supabase = createClient();
      
      try {
        // Check authentication
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push('/auth/login');
          return;
        }
        
        setIsAuthenticated(true);
        setCheckingAuth(false);

        // Load user's ready projects only
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "ready")
          .not("final_video_path", "is", null)
          .order(sortBy, { ascending: false });

        if (projectsError) {
          throw projectsError;
        }

        setProjects(projectsData || []);
      } catch (err: any) {
        console.error("Error loading projects:", err);
        setError(err.message || "Erreur lors du chargement des assets");
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoadProjects();
  }, [router, sortBy]);

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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              📁 Mes Assets
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Gérez et réutilisez vos vidéos, images et audios
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Sort selector */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "created_at" | "cost_credits")}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="created_at">Plus récent</option>
              <option value="cost_credits">Plus coûteux</option>
            </select>
            
            {/* View mode toggle */}
            <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1 rounded text-sm transition-all ${
                  viewMode === "grid"
                    ? "bg-white dark:bg-slate-600 shadow"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                🔲 Grille
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 rounded text-sm transition-all ${
                  viewMode === "list"
                    ? "bg-white dark:bg-slate-600 shadow"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                📋 Liste
              </button>
            </div>
            
            <button
              onClick={() => router.push("/creator/generate")}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              ➕ Créer
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400">⚠️ {error}</p>
          </div>
        )}

        {/* Assets Grid/List */}
        {projects.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">📁</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Aucun asset disponible
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Créez votre première vidéo pour commencer à constituer votre bibliothèque d'assets
            </p>
            <button
              onClick={() => router.push("/creator/generate")}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
            >
              🎬 Créer ma première vidéo
            </button>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((project) => (
              <div key={project.id} className="relative group">
                <VideoCard
                  id={project.id}
                  final_url={project.final_video_path!}
                  prompt={project.prompt}
                />
                
                {/* Asset metadata */}
                <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span>{project.model}</span>
                    <span>{project.cost_credits} crédits</span>
                  </div>
                  
                  <div className="text-xs text-slate-400">
                    {new Date(project.created_at).toLocaleDateString("fr-FR")}
                  </div>
                  
                  {project.youtube_video_id && (
                    <div className="mt-2">
                      <a
                        href={`https://youtube.com/watch?v=${project.youtube_video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                      >
                        📺 YouTube
                      </a>
                    </div>
                  )}
                  
                  <div className="mt-2 flex gap-1">
                    <button
                      onClick={() => router.push(`/creator/view/${project.id}`)}
                      className="flex-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs py-1 px-2 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all"
                    >
                      👁️ Voir
                    </button>
                    <a
                      href={project.final_video_path!}
                      download
                      className="flex-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs py-1 px-2 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-all text-center"
                    >
                      📥 DL
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 flex items-center gap-6"
              >
                {/* Video thumbnail */}
                <div className="w-32 h-18 bg-black rounded-lg overflow-hidden flex-shrink-0">
                  <video
                    src={project.final_video_path!}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    poster={project.thumbnail_path || undefined}
                  />
                </div>
                
                {/* Content */}
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {project.title || project.prompt.split('.')[0]}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    {project.prompt}
                  </p>
                  <div className="flex gap-4 text-xs text-slate-500">
                    <span>Modèle: {project.model}</span>
                    <span>Coût: {project.cost_credits} crédits</span>
                    <span>Créé: {new Date(project.created_at).toLocaleDateString("fr-FR")}</span>
                    {project.youtube_video_id && (
                      <a
                        href={`https://youtube.com/watch?v=${project.youtube_video_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-600 hover:text-red-700"
                      >
                        📺 YouTube
                      </a>
                    )}
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => router.push(`/creator/view/${project.id}`)}
                    className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-2 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all"
                  >
                    👁️ Voir
                  </button>
                  <a
                    href={project.final_video_path!}
                    download
                    className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-2 rounded text-sm hover:bg-green-200 dark:hover:bg-green-900/50 transition-all"
                  >
                    📥 Télécharger
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}