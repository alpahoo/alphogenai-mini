"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Job {
  id: string;
  prompt: string;
  status: string;
  current_stage: string | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  video_url: string | null;
  final_url: string | null;
}

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const fetchJobs = async () => {
    try {
      const res = await fetch("/api/admin/list-jobs");
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error("Erreur fetch jobs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // Refresh toutes les 5 secondes
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (jobId: string) => {
    if (!confirm("Relancer ce job ?")) return;
    
    try {
      const res = await fetch("/api/admin/retry-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      setMessage(data.message || "✅ Job relancé");
      fetchJobs();
    } catch (err: any) {
      setMessage(`❌ Erreur: ${err.message}`);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm("Annuler ce job ?")) return;
    
    try {
      const res = await fetch("/api/admin/cancel-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      setMessage(data.message || "✅ Job annulé");
      fetchJobs();
    } catch (err: any) {
      setMessage(`❌ Erreur: ${err.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "cancelled":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "in_progress":
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    }
  };

  return (
    <main className="min-h-screen p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              📊 Tous les Jobs
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Gestion et monitoring des générations vidéo
            </p>
          </div>
          <button
            onClick={() => router.push("/creator/generate")}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all"
          >
            ← Retour
          </button>
        </div>

        {message && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-blue-700 dark:text-blue-300">{message}</p>
          </div>
        )}

        {/* Liste des jobs */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                Aucun job trouvé
              </div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            job.status
                          )}`}
                        >
                          {job.status}
                        </span>
                        {job.current_stage && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Stage: {job.current_stage}
                          </span>
                        )}
                        {job.retry_count > 0 && (
                          <span className="text-xs text-orange-600 dark:text-orange-400">
                            Retries: {job.retry_count}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-900 dark:text-slate-100 font-medium mb-2">
                        {job.prompt}
                      </p>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        ID: {job.id}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Créé: {new Date(job.created_at).toLocaleString("fr-FR")}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      {job.status === "failed" && (
                        <button
                          onClick={() => handleRetry(job.id)}
                          className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded text-sm hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all"
                        >
                          🔄 Retry
                        </button>
                      )}
                      {(job.status === "pending" || job.status === "in_progress") && (
                        <button
                          onClick={() => handleCancel(job.id)}
                          className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-1 rounded text-sm hover:bg-red-200 dark:hover:bg-red-900/50 transition-all"
                        >
                          🛑 Annuler
                        </button>
                      )}
                      {job.final_url && (
                        <button
                          onClick={() => router.push(`/v/${job.id}`)}
                          className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-3 py-1 rounded text-sm hover:bg-green-200 dark:hover:bg-green-900/50 transition-all"
                        >
                          👁️ Voir
                        </button>
                      )}
                    </div>
                  </div>

                  {job.error_message && (
                    <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
                      <p className="text-red-700 dark:text-red-300">
                        ⚠️ {job.error_message}
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}
