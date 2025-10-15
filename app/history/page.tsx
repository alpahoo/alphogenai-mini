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

export default function HistoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
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

        // Load user's projects
        const { data: projectsData, error: projectsError } = await supabase
          .from("projects")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (projectsError) {
          throw projectsError;
        }

        setProjects(projectsData || []);
      } catch (err: any) {
        console.error("Error loading projects:", err);
        setError(err.message || "Erreur lors du chargement des projets");
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoadProjects();
  }, [router]);

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Supprimer ce projet définitivement ?")) return;

    try {
      const supabase = createClient();
      
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);

      if (error) throw error;

      // Remove from local state
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err: any) {
      alert(`Erreur lors de la suppression: ${err.message}`);
    }
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

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </main>
    );
  }

  const readyProjects = projects.filter(p => p.status === "ready" && p.final_video_path);
  const pendingProjects = projects.filter(p => p.status !== "ready" || !p.final_video_path);

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              🎬 Mes Vidéos
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Gérez et partagez vos créations vidéo IA
            </p>
          </div>
          <button
            onClick={() => router.push("/creator/generate")}
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            ➕ Nouvelle vidéo
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400">⚠️ {error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {readyProjects.length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Vidéos prêtes
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                <span className="text-2xl">⏳</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {pendingProjects.length}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  En cours
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {projects.reduce((sum, p) => sum + (p.cost_credits || 0), 0)}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Crédits utilisés
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ready Videos */}
        {readyProjects.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">
              📹 Vidéos terminées ({readyProjects.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {readyProjects.map((project) => (
                <div key={project.id} className="relative group">
                  <VideoCard
                    id={project.id}
                    final_url={project.final_video_path!}
                    prompt={project.prompt}
                  />
                  
                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex gap-1">
                      <button
                        onClick={() => router.push(`/creator/view/${project.id}`)}
                        className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        title="Voir détails"
                      >
                        👁️
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="bg-red-600 text-white p-2 rounded-lg hover:bg-red-700 transition-colors text-sm"
                        title="Supprimer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  
                  {/* Project info */}
                  <div className="mt-2 text-xs text-slate-500">
                    <div className="flex justify-between">
                      <span>{project.model}</span>
                      <span>{project.cost_credits} crédits</span>
                    </div>
                    {project.youtube_video_id && (
                      <div className="mt-1">
                        <a
                          href={`https://youtube.com/watch?v=${project.youtube_video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-red-600 hover:text-red-700"
                        >
                          📺 Sur YouTube
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pending Projects */}
        {pendingProjects.length > 0 && (
          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100">
              ⏳ Projets en cours ({pendingProjects.length})
            </h2>
            <div className="space-y-4">
              {pendingProjects.map((project) => (
                <div
                  key={project.id}
                  className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                        {project.title || project.prompt}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        {project.prompt}
                      </p>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>Status: {project.status}</span>
                        <span>Modèle: {project.model}</span>
                        <span>Créé: {new Date(project.created_at).toLocaleDateString("fr-FR")}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => router.push(`/creator/view/${project.id}`)}
                        className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all"
                      >
                        👁️ Voir
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded text-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-all"
                      >
                        🗑️ Supprimer
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {projects.length === 0 && (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">🎬</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
              Aucune vidéo créée
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Commencez par créer votre première vidéo IA
            </p>
            <button
              onClick={() => router.push("/creator/generate")}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
            >
              🎬 Créer ma première vidéo
            </button>
          </div>
        )}
      </div>
    </main>
  );
}