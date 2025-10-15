"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

interface ProjectScene {
  id: string;
  scene_number: number;
  prompt: string;
  output_url: string | null;
  duration: number;
  status: string;
  music_url: string | null;
  music_name: string | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectViewPage({ params }: PageProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<ProjectScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function loadProject() {
      try {
        const resolvedParams = await params;
        const projectId = resolvedParams.id;
        
        const supabase = createClient();
        
        // Load project
        const { data: projectData, error: projectError } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (projectError || !projectData) {
          setError("Projet introuvable");
          return;
        }

        setProject(projectData);

        // Load scenes
        const { data: scenesData, error: scenesError } = await supabase
          .from("project_scenes")
          .select("*")
          .eq("project_id", projectId)
          .order("scene_number");

        if (scenesError) {
          console.error("Error loading scenes:", scenesError);
        } else {
          setScenes(scenesData || []);
        }
      } catch (err) {
        console.error("Error loading project:", err);
        setError("Erreur lors du chargement du projet");
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [params]);

  const handleAssembleVideo = async () => {
    if (!project) return;

    setAssembling(true);
    try {
      // TODO: Call worker to assemble video with ffmpeg
      const response = await fetch("/api/assemble-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });

      if (!response.ok) {
        throw new Error("Erreur lors de l'assemblage");
      }

      const data = await response.json();
      alert("Assemblage démarré ! La vidéo finale sera prête dans quelques minutes.");
      
      // Refresh project data
      window.location.reload();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setAssembling(false);
    }
  };

  const handlePublishYouTube = async () => {
    if (!project?.final_video_path) return;

    try {
      const response = await fetch("/api/youtube/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          projectId: project.id,
          title: project.title || project.prompt.substring(0, 50),
          description: project.prompt,
          privacy: "private"
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.needsAuth) {
          // Redirect to YouTube OAuth
          const authResponse = await fetch("/api/youtube/auth/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              userId: project.user_id,
              projectId: project.id 
            }),
          });
          
          const authData = await authResponse.json();
          if (authData.authUrl) {
            window.location.href = authData.authUrl;
            return;
          }
        }
        throw new Error(data.error || "Erreur lors de la publication");
      }

      alert(`Vidéo publiée sur YouTube ! ID: ${data.videoId}`);
      
      // Refresh project data
      window.location.reload();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
  };

  const handleAuthYouTube = async () => {
    if (!project) return;

    try {
      const response = await fetch("/api/youtube/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: project.user_id,
          projectId: project.id 
        }),
      });

      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (err: any) {
      alert(`Erreur d'authentification: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">❌ {error || "Projet introuvable"}</h1>
          <button
            onClick={() => router.push("/creator/generate")}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            ← Retour
          </button>
        </div>
      </main>
    );
  }

  const completedScenes = scenes.filter(scene => scene.status === "completed" && scene.output_url);
  const canAssemble = completedScenes.length > 0 && !project.final_video_path;
  const canPublish = project.final_video_path && project.youtube_token && !project.youtube_video_id;
  const needsYouTubeAuth = project.final_video_path && !project.youtube_token;

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              🎬 {project.title || "Projet Vidéo"}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              {project.prompt}
            </p>
            <div className="flex gap-4 mt-2 text-sm text-slate-500">
              <span>Modèle: {project.model}</span>
              <span>Coût: {project.cost_credits} crédits</span>
              <span>Status: {project.status}</span>
            </div>
          </div>
          <button
            onClick={() => router.push("/creator/generate")}
            className="bg-slate-600 text-white px-4 py-2 rounded-lg hover:bg-slate-700 transition-all"
          >
            ← Retour
          </button>
        </div>

        {/* Actions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 mb-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="flex gap-4">
            {canAssemble && (
              <button
                onClick={handleAssembleVideo}
                disabled={assembling}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-all"
              >
                {assembling ? "Assemblage..." : "🎵 Assembler en WebM"}
              </button>
            )}
            
            {project.final_video_path && (
              <a
                href={project.final_video_path}
                download
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-all inline-block"
              >
                📥 Télécharger
              </a>
            )}

            {needsYouTubeAuth && (
              <button
                onClick={handleAuthYouTube}
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-all"
              >
                🔗 Connecter YouTube
              </button>
            )}

            {canPublish && (
              <button
                onClick={handlePublishYouTube}
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-all"
              >
                📺 Publier sur YouTube
              </button>
            )}

            {project.youtube_video_id && (
              <a
                href={`https://youtube.com/watch?v=${project.youtube_video_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-all inline-block"
              >
                📺 Voir sur YouTube
              </a>
            )}
          </div>
        </div>

        {/* Final Video Preview */}
        {project.final_video_path && (
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 mb-6 border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-semibold mb-4">Vidéo Finale</h2>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              <video
                src={project.final_video_path}
                controls
                className="w-full h-full"
                poster={project.thumbnail_path || undefined}
              />
            </div>
          </div>
        )}

        {/* Scenes */}
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold mb-4">
            Scènes ({completedScenes.length}/{scenes.length})
          </h2>
          
          {scenes.length === 0 ? (
            <p className="text-slate-500">Aucune scène générée</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden"
                >
                  {scene.output_url ? (
                    <div className="aspect-video bg-black">
                      <video
                        src={scene.output_url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        controls
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                        <p className="text-sm text-slate-500">Génération...</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Scène {scene.scene_number}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        scene.status === "completed" 
                          ? "bg-green-100 text-green-800" 
                          : scene.status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {scene.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                      {scene.prompt}
                    </p>
                    {scene.music_name && (
                      <p className="text-xs text-slate-500">
                        🎵 {scene.music_name}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}