import { createClient } from "@supabase/supabase-js";
import VideoPlayer from "./VideoPlayer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VideoPage({ params }: PageProps) {
  const resolvedParams = await params;
  const jobId = resolvedParams.id;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_URL;
  const supabaseAnonKey = 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">⚙️ Configuration manquante</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Les variables d'environnement Supabase ne sont pas configurées.
          </p>
        </div>
      </main>
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Récupérer le job depuis Supabase
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">❌ Vidéo introuvable</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Le job demandé n'existe pas ou a été supprimé.
          </p>
          <a
            href="/generate"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            ← Créer une vidéo
          </a>
        </div>
      </main>
    );
  }

  // Passer le job au composant client pour polling
  return <VideoPlayer initialJob={job} />;
}
