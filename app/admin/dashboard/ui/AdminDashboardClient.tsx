"use client";
import { useState } from "react";

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
}

export default function AdminDashboardClient({ initialData }: { initialData: ScheduledPost[] }) {
  const [items, setItems] = useState<ScheduledPost[]>(initialData || []);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/admin/scheduled", { cache: "no-store" });
    const data = await res.json();
    setItems(data.items || []);
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
                </div>
                <div className="flex gap-2">
                  <button disabled={loading} onClick={() => approve(it.id)} className="px-3 py-1 rounded bg-green-600 text-white">Approuver</button>
                  <button disabled={loading} onClick={() => reject(it.id)} className="px-3 py-1 rounded bg-red-600 text-white">Rejeter</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
