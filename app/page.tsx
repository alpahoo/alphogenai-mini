export const metadata = {
  title: "AlphoGenAI Mini — Générez des vidéos cohérentes à partir de texte",
  description:
    "Transformez vos idées en vidéos en quelques minutes.",
  keywords: "vidéo IA, génération vidéo, text to video, IA générative",
};

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
        <h1 className="text-3xl font-bold mb-3">AlphoGenAI Mini</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          V1: un seul pipeline, un seul backend vidéo.
        </p>
        <a
          href="/generate"
          className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium"
        >
          🎬 Générer une vidéo
        </a>
      </div>
    </main>
  );
}
