'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ManualJobPage() {
  const [prompt, setPrompt] = useState('');
  const [runwayTasksJson, setRunwayTasksJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function checkAdmin() {
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
      
      setCheckingAuth(false);
    }
    
    checkAdmin();
  }, [router]);

  const handleCreateJob = async () => {
    setError(null);
    setSuccess(null);
    
    if (!prompt.trim()) {
      setError('Le prompt est requis');
      return;
    }
    
    if (!runwayTasksJson.trim()) {
      setError('Les task IDs Runway sont requis');
      return;
    }
    
    let runwayTasks;
    try {
      runwayTasks = JSON.parse(runwayTasksJson);
    } catch (e) {
      setError('Format JSON invalide. Vérifiez la syntaxe.');
      return;
    }
    
    setLoading(true);
    
    try {
      const res = await fetch('/api/admin/create-manual-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          runway_tasks: runwayTasks
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la création du job');
      }
      
      setSuccess(`✅ Job créé avec succès ! ID: ${data.job.id}`);
      setPrompt('');
      setRunwayTasksJson('');
      
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleFixOldJobs = async () => {
    setFixing(true);
    setFixResult(null);
    
    try {
      const res = await fetch('/api/admin/fix-manual-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la correction des jobs');
      }
      
      if (data.fixed === 0) {
        setFixResult('ℹ️ Aucun job à corriger trouvé.');
      } else {
        setFixResult(`✅ ${data.fixed} job(s) corrigé(s) avec succès ! Ils apparaîtront maintenant dans le dropdown de réutilisation.`);
      }
    } catch (err: any) {
      setFixResult(`❌ Erreur: ${err.message || 'Une erreur est survenue'}`);
    } finally {
      setFixing(false);
    }
  };

  const exampleJson = `{
  "1": {
    "image_task_id": "gen-xxxxxxxxxxxxx",
    "video_task_id": "gen-yyyyyyyyyyyyy",
    "image_url": "https://sdk.prod.us-east-1.runway.ai/.../image.webp",
    "video_url": "https://sdk.prod.us-east-1.runway.ai/.../video.mp4",
    "status": "succeeded"
  },
  "2": {
    "image_task_id": "gen-zzzzzzzzzzzzz",
    "video_task_id": "gen-aaaaaaaaaaaaa",
    "image_url": "https://sdk.prod.us-east-1.runway.ai/.../image.webp",
    "video_url": "https://sdk.prod.us-east-1.runway.ai/.../video.mp4",
    "status": "succeeded"
  }
}`;

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-600 dark:text-zinc-400">
          Vérification des permissions...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            🔧 Créer un Job Manuel (Admin)
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Créez un job de test avec des task IDs Runway existants pour tester la réutilisation d'assets
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Prompt du Job
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décrivez le contenu de cette vidéo..."
              className="w-full h-24 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Runway Tasks (Format JSON)
            </label>
            <textarea
              value={runwayTasksJson}
              onChange={(e) => setRunwayTasksJson(e.target.value)}
              placeholder={exampleJson}
              className="w-full h-64 border-2 border-slate-300 dark:border-slate-600 rounded-lg p-4 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none font-mono text-sm"
              disabled={loading}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              💡 Collez les task IDs de vos assets Runway existants au format JSON ci-dessus
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
              📋 Format attendu
            </h3>
            <pre className="text-xs text-blue-800 dark:text-blue-200 overflow-x-auto">
              {exampleJson}
            </pre>
            <p className="mt-3 text-xs text-blue-700 dark:text-blue-300">
              Chaque scène doit avoir : <code>image_task_id</code>, <code>video_task_id</code>, 
              <code>image_url</code>, <code>video_url</code>, et <code>status: "succeeded"</code>
            </p>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-green-600 dark:text-green-400 text-sm">
                {success}
              </p>
              <p className="text-green-600 dark:text-green-400 text-xs mt-1">
                Redirection vers le dashboard dans 2 secondes...
              </p>
            </div>
          )}

          <button
            onClick={handleCreateJob}
            disabled={loading || !prompt.trim() || !runwayTasksJson.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Création en cours...
              </span>
            ) : (
              '🔧 Créer le Job Manuel'
            )}
          </button>

          <div className="text-center">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline"
              disabled={loading}
            >
              ← Retour au dashboard
            </button>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            🔧 Corriger les anciens jobs manuels
          </h3>
          <p className="text-xs text-blue-800 dark:text-blue-200 mb-3">
            Si des jobs manuels créés avant le 12 octobre 2025 n&apos;apparaissent pas dans le dropdown de réutilisation, cliquez sur ce bouton pour les corriger.
          </p>
          <button
            onClick={handleFixOldJobs}
            disabled={fixing}
            className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all"
          >
            {fixing ? 'Correction en cours...' : '🔧 Corriger les anciens jobs'}
          </button>
          {fixResult && (
            <div className="mt-3 text-xs text-blue-800 dark:text-blue-200">
              {fixResult}
            </div>
          )}
        </div>

        <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100 mb-2">
            ⚠️ Important
          </h3>
          <ul className="text-xs text-yellow-800 dark:text-yellow-200 space-y-1">
            <li>• Cette page est strictement réservée aux administrateurs</li>
            <li>• Les jobs créés manuellement auront le status &quot;done&quot;</li>
            <li>• Ils apparaîtront immédiatement dans le dropdown de réutilisation</li>
            <li>• Assurez-vous que les task IDs Runway existent et sont valides</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
