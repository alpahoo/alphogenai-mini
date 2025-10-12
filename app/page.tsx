import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import VideoCard from "./(components)/VideoCard";

export const metadata = {
  title: "AlphoGenAI Mini — Générez des vidéos cohérentes à partir de texte",
  description:
    "Transformez vos idées en vidéos professionnelles avec IA. Script, voix, sous-titres et montage automatiques en quelques minutes.",
  keywords: "vidéo IA, génération vidéo, text to video, IA générative",
};

interface Video {
  id: string;
  prompt: string;
  final_url: string;
  created_at: string;
}

async function getRecentVideos(): Promise<Video[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 
      process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL || 
      process.env.SUPABASE_SUPABASE_URL;
    const supabaseAnonKey = 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
      process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return [];
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase
      .from("jobs")
      .select("id, prompt, final_url, created_at")
      .in("status", ["done", "completed"])
      .not("final_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);

    if (error) {
      console.error("Error fetching videos:", error);
      return [];
    }

    return (data as Video[]) || [];
  } catch (err) {
    console.error("Failed to fetch videos:", err);
    return [];
  }
}

export default async function HomePage() {
  const videos = await getRecentVideos();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              IA générative • Vidéos cohérentes
            </div>

            {/* Titre principal */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="block text-slate-900 dark:text-white">
                De l'idée à la vidéo
              </span>
              <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                en quelques minutes
              </span>
            </h1>

            {/* Sous-titre */}
            <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-600 dark:text-slate-400">
              Décrivez votre concept, notre IA crée le script, génère les
              visuels, ajoute la voix et assemble le tout avec des sous-titres
              professionnels.
            </p>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/creator/generate"
                className="group bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Créer ma vidéo
                <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </Link>
            </div>

            {/* Bande de crédibilité */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 max-w-3xl mx-auto pt-8">
              {[
                { icon: "⚡", label: "4-9 minutes", desc: "Génération rapide" },
                { icon: "🎬", label: "100% cohérent", desc: "Script IA" },
                { icon: "💬", label: "Sous-titré", desc: "Français natif" },
                { icon: "🔗", label: "Partageable", desc: "URL directe" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-2 p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg backdrop-blur-sm"
                >
                  <span className="text-3xl">{item.icon}</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-sm">
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Decorative gradient */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>
      </section>

      {/* Section Dernières Vidéos */}
      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">
              Dernières créations
            </h2>
            <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Découvrez ce que notre communauté crée avec AlphoGenAI Mini
            </p>
          </div>

          {videos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  id={video.id}
                  final_url={video.final_url}
                  prompt={video.prompt}
                />
              ))}
            </div>
          ) : (
            /* État vide */
            <div className="max-w-md mx-auto text-center py-16">
              <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg space-y-6">
                <div className="text-6xl">🎬</div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Créez la première vidéo
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Aucune vidéo publique pour le moment. Soyez le premier à
                  créer une vidéo avec notre IA !
                </p>
                <Link
                  href="/creator/generate"
                  className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md"
                >
                  Commencer maintenant
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section CTA Final */}
      <section className="py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 sm:p-12 text-center shadow-2xl">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Prêt à créer votre vidéo ?
            </h2>
            <p className="text-blue-100 text-lg mb-8 max-w-2xl mx-auto">
              Décrivez votre idée en quelques phrases et laissez notre IA
              transformer votre texte en vidéo professionnelle.
            </p>
            <Link
              href="/creator/generate"
              className="inline-block bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              Générer ma vidéo gratuitement
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
