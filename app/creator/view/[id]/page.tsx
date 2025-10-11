import { createClient } from "@/lib/supabase/server";

async function getData(projectId: string) {
  const supabase = await createClient();
  const { data: project } = await supabase.from("projects").select("*, music_file_path").eq("id", projectId).single();
  const { data: scenes } = await supabase.from("project_scenes").select("id, idx, title, video_path, status").eq("project_id", projectId).order("idx", { ascending: true });
  const tone = project?.tone || "fun";
  const { data: track } = await supabase.from("music_tracks").select("file_path").eq("tone", tone).limit(1).single();
  return { project, scenes: scenes || [], musicPath: track?.file_path || project?.music_file_path || null };
}

export default async function CreatorViewPage({ params }: { params: { id: string } }) {
  const { project, scenes, musicPath } = await getData(params.id);
  if (!project) return <main className="p-6">Projet introuvable</main>;

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">{project.title}</h1>
        <VideoPlayer scenes={scenes} musicPath={musicPath} />
      </div>
    </main>
  );
}

function getPublicUrlFromPath(path: string | null | undefined) {
  if (!path) return null;
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || process.env.STORAGE_BUCKET || "videos";
  return `${baseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

function VideoPlayer({ scenes, musicPath }: { scenes: Array<{ id: string; idx: number; title: string; video_path: string | null; status: string }>, musicPath: string | null }) {
  const urls = scenes.map((s) => getPublicUrlFromPath(s.video_path)).filter(Boolean) as string[];
  const musicUrl = getPublicUrlFromPath(musicPath);

  return (
    <div className="space-y-3">
      {musicUrl && (
        <audio controls src={musicUrl} className="w-full" />
      )}
      <div className="space-y-2">
        {urls.length === 0 ? (
          <div className="text-slate-500">Aucune scène prête</div>
        ) : (
          urls.map((u, i) => (
            <video key={i} src={u} controls className="w-full rounded border" />
          ))
        )}
      </div>
    </div>
  );
}
