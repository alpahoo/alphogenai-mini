"use client";
import { useState } from "react";
import { createClient as createSupabaseBrowser } from "@/lib/supabase/client";

interface ScheduledPost {
  id: string;
  project_id: string;
  user_id: string | null;
  targets: string[];
  status: string;
  scheduled_for: string | null;
  approved_by: string | null;
  published_urls: Record<string, string>;
  created_at: string;
  updated_at: string;
  // Nested project fields when available from server-side fetch
  projects?: { title: string; final_video_path: string | null } | null;
}

export default function AdminDashboardClient({ initialData }: { initialData: ScheduledPost[] }) {
  const [items, setItems] = useState<ScheduledPost[]>(initialData || []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/admin/scheduled", { cache: "no-store" });
    const data = await res.json();
    const next: ScheduledPost[] = data.items || [];
    // Preserve nested project info if API does not include it
    const byId = new Map(items.map((it) => [it.id, it.projects]));
    setItems(next.map((it: ScheduledPost) => ({ ...it, projects: (it as any).projects ?? byId.get(it.id) ?? null })));
  };

  const approve = async (id: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/scheduled/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessage("✅ Approuvé");
      refresh();
    } catch (e: any) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const reject = async (id: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/scheduled/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMessage("🛑 Rejeté");
      refresh();
    } catch (e: any) {
      setMessage(`❌ ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const publishToYouTube = async (it: ScheduledPost) => {
    try {
      setPublishingId(it.id);
      const supabase = createSupabaseBrowser();
      const { data: userData, error } = await supabase.auth.getUser();
      if (error || !userData?.user) throw new Error("Non authentifié");
      const userId = userData.user.id;

      const title = it.projects?.title || `Projet ${it.project_id}`;
      const body = {
        project_id: it.project_id,
        title,
        description: "Générée par AlphoGenAI Mini",
        privacyStatus: "unlisted",
        user_id: userId,
      };
      const res = await fetch("/api/publish/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Echec de la publication");
      setMessage(`✅ Publié: ${json.link || json.videoId || "OK"}`);
      alert(`Publication YouTube réussie${json.link ? `: ${json.link}` : ""}`);
    } catch (e: any) {
      console.error("publish error", e);
      setMessage(`❌ ${e.message || String(e)}`);
      alert(`Erreur publication: ${e.message || String(e)}`);
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400">Modération et publication</p>
          </div>
          <button onClick={refresh} className="px-3 py-2 rounded bg-slate-800 text-white">Rafraîchir</button>
        </div>

        {message && (
          <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800/50 rounded border">{message}</div>
        )}

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="text-slate-500">Aucun élément</div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="bg-white dark:bg-slate-800 border rounded p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">Projet: {it.project_id}</div>
                  <div className="text-xs text-slate-500">Cibles: {it.targets?.join(", ") || "-"}</div>
                  <div className="text-xs text-slate-500">Status: {it.status}</div>
                  {it.projects?.title && (
                    <div className="text-xs text-slate-500">Titre: {it.projects.title}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button disabled={loading} onClick={() => approve(it.id)} className="px-3 py-1 rounded bg-green-600 text-white">Approuver</button>
                  <button disabled={loading} onClick={() => reject(it.id)} className="px-3 py-1 rounded bg-red-600 text-white">Rejeter</button>
                  {/* Voir */}
                  <a
                    href={`/creator/view/${it.project_id}`}
                    className="px-3 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm hover:bg-green-200 dark:hover:bg-green-900/50 transition-all"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Voir
                  </a>
                  {/* Publier sur YouTube - only when approved and final video exists */}
                  {it.status === "approved" && it.projects?.final_video_path && (
                    <button
                      disabled={publishingId === it.id}
                      onClick={() => publishToYouTube(it)}
                      className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60"
                    >
                      {publishingId === it.id ? "Publication..." : "Publier sur YouTube"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
