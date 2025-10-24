'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function AdminAssetsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();
  
  useEffect(() => {
    checkAdminAndFetchJobs();
  }, []);
  
  async function checkAdminAndFetchJobs() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      router.push('/auth/login');
      return;
    }
    
    const adminStatus = user.user_metadata?.role === 'admin';
    setIsAdmin(adminStatus);
    
    if (!adminStatus) {
      router.push('/');
      return;
    }
    
    fetchJobsWithAssets();
  }
  
  async function fetchJobsWithAssets() {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('jobs')
        .select('id, user_id, prompt, created_at, status, app_state')
        .order('created_at', { ascending: false })
        .limit(100);
      
      const jobsWithAssets = data?.filter(job => 
        job.app_state?.runway_tasks && 
        Object.keys(job.app_state.runway_tasks).length > 0
      ) || [];
      
      setJobs(jobsWithAssets);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    } finally {
      setLoading(false);
    }
  }
  
  function copyJobId(jobId: string) {
    navigator.clipboard.writeText(jobId);
    alert('Job ID copié ! Utilisez-le dans la fonctionnalité de réutilisation des assets.');
  }
  
  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }
  
  if (!isAdmin) {
    return null;
  }
  
  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          📦 Bibliothèque d'Assets
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Tous les jobs avec des assets Runway générés
        </p>
      </div>
      
      {jobs.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-8 text-center border border-slate-200 dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400">
            Aucun job avec des assets Runway trouvé
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {jobs.map(job => {
            const runwayTasks = job.app_state?.runway_tasks || {};
            const sceneCount = Object.keys(runwayTasks).length;
            
            return (
              <div 
                key={job.id} 
                className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      {job.prompt.substring(0, 80)}...
                    </h3>
                    <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                      <p>Job ID: <code className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">{job.id}</code></p>
                      <p>User: {job.user_id}</p>
                      <p>Créé: {new Date(job.created_at).toLocaleString()}</p>
                      <p>Status: <span className={`px-2 py-1 rounded text-xs ${
                        job.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        job.status === 'failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      }`}>{job.status}</span></p>
                    </div>
                  </div>
                  <span className="text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-3 py-1 rounded-full font-medium">
                    {sceneCount} scène{sceneCount > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="grid grid-cols-6 gap-2 mb-4">
                  {Object.entries(runwayTasks).map(([sceneNum, tasks]: [string, any]) => (
                    <div 
                      key={sceneNum} 
                      className="border border-slate-200 dark:border-slate-600 rounded-lg p-3 text-xs bg-slate-50 dark:bg-slate-700/50"
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100 mb-2">
                        Scène {sceneNum}
                      </div>
                      {tasks.image_url && (
                        <div className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <span>✓</span> Image
                        </div>
                      )}
                      {tasks.video_url && (
                        <div className="text-green-600 dark:text-green-400 flex items-center gap-1">
                          <span>✓</span> Video
                        </div>
                      )}
                      {tasks.image_task_id && (
                        <div className="text-slate-500 dark:text-slate-400 mt-1 truncate" title={tasks.image_task_id}>
                          ID: {tasks.image_task_id.substring(0, 8)}...
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => copyJobId(job.id)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-2"
                >
                  <span>📋</span>
                  Copier le Job ID pour réutilisation
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
