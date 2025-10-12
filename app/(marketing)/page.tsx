import Link from "next/link";
import VideoCard from "../(components)/VideoCard";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export const metadata = {
  title: "AlphoGenAI Mini — Générez des vidéos cohérentes à partir de texte",
  description:
    "Transformez vos idées en vidéos professionnelles avec IA. Script, voix, sous-titres et montage automatiques en quelques minutes.",
};

interface Video { id: string; prompt: string; final_url: string; created_at: string }

async function getRecentVideos(): Promise<Video[]> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return [];
    const supabase = createServiceClient(supabaseUrl, supabaseAnonKey);
    const { data } = await supabase
      .from("jobs")
      .select("id, prompt, final_url, created_at")
      .in("status", ["done", "completed"])
      .not("final_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(6);
    return (data as Video[]) || [];
  } catch {
    return [];
  }
}

export default async function MarketingHome() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user) redirect("/creator/generate");

  const videos = await getRecentVideos();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="text-center space-y-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="block text-slate-900 dark:text-white">De l'idée à la vidéo</span>
              <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">en quelques minutes</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg sm:text-xl text-slate-600 dark:text-slate-400">
              Inspirez-vous de videoinu.com: créez des vidéos cohérentes, avec un flux simple et fluide.
            </p>
            <div className="flex items-center justify-center">
              <Link href="/creator/generate" className="group bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl">
                Générer ma vidéo gratuitement
                <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl"></div>
        </div>
      </section>

      {videos.length > 0 && (
        <section className="py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-4">Dernières créations</h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">Découvrez ce que notre communauté crée</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((v) => (
                <VideoCard key={v.id} id={v.id} final_url={v.final_url} prompt={v.prompt} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
