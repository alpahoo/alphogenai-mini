"""
Worker background qui traite les jobs AlphogenAI Mini
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

from .supabase_client import SupabaseClient
from .runway_orchestrator import RunwayOrchestrator
from .config import get_settings


class AlphogenAIWorker:
    """Worker qui poll la table jobs et exécute l'orchestrateur"""
    
    def __init__(self, poll_interval: int = 10):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.orchestrator = RunwayOrchestrator()
        self.poll_interval = poll_interval
        self.running = False
        self.current_job_id: Optional[str] = None
    
    async def start(self):
        """Démarre le worker"""
        self.running = True
        
        print("="*60)
        print("🎬 AlphogenAI Mini Worker")
        print("="*60)
        print(f"Démarré: {datetime.now().isoformat()}")
        print(f"Intervalle de poll: {self.poll_interval}s")
        print(f"Retries max: {self.settings.MAX_RETRIES}")
        print("="*60)
        print("\nEn attente de jobs...\n")
        
        # Gestion des signaux
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        while self.running:
            try:
                await self._process_pending_jobs()
                await asyncio.sleep(self.poll_interval)
                
            except KeyboardInterrupt:
                print("\n\nInterruption reçue...")
                break
            except Exception as e:
                print(f"[ERREUR] Worker : {str(e)}")
                await asyncio.sleep(self.poll_interval)
        
        print("\nWorker arrêté.")
    
    def _signal_handler(self, signum, frame):
        """Arrêt gracieux"""
        print(f"\nSignal {signum} reçu")
        self.running = False
        
        if self.current_job_id:
            print(f"Job {self.current_job_id} sera marqué comme échoué")
    
    async def _process_pending_jobs(self):
        """Poll et traite les jobs en attente + récupération des jobs bloqués"""
        
        # Étape 1: Récupérer les jobs bloqués (in_progress depuis > 5min)
        await self._recover_stuck_jobs()
        
        # Étape 2: Chercher un job pending
        result = self.supabase.client.table("jobs") \
            .select("*") \
            .eq("status", "pending") \
            .order("created_at") \
            .limit(1) \
            .execute()
        
        if not result.data or len(result.data) == 0:
            return
        
        job = result.data[0]
        self.current_job_id = job["id"]
        
        print(f"\n{'='*60}")
        print(f"🎬 Traitement du job: {job['id']}")
        print(f"Utilisateur: {job['user_id']}")
        print(f"Prompt: {job['prompt'][:80]}...")
        print(f"{'='*60}\n")
        
        try:
            # Marquer comme in_progress
            await self.supabase.update_job_state(
                job["id"],
                "in_progress",
                {}
            )
            
            app_state = job.get("app_state", {})
            source_job_id = app_state.get("source_job_id")
            
            result = await self.orchestrator.run(
                job_id=job["id"],
                user_id=job["user_id"],
                prompt=job["prompt"],
                source_job_id=source_job_id
            )
            
            if result["status"] == "success":
                print(f"\n✅ Job {job['id']} terminé avec succès!")
                print(f"Vidéo: {result.get('video_url', 'N/A')}\n")
            else:
                print(f"\n❌ Job {job['id']} échoué: {result.get('error', 'Erreur inconnue')}\n")
            
        except Exception as e:
            print(f"\n❌ Job {job['id']} échoué avec exception: {str(e)}\n")
            await self.supabase.update_job_state(
                job["id"],
                "failed",
                {},
                error_message=str(e)
            )
        
        finally:
            self.current_job_id = None
    
    async def _recover_stuck_jobs(self):
        """Récupère les jobs bloqués en in_progress depuis > 5 minutes"""
        from datetime import datetime, timedelta, timezone
        
        try:
            # Calculer le timestamp d'il y a 5 minutes
            five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
            
            # Chercher les jobs in_progress depuis > 5 minutes
            result = self.supabase.client.table("jobs") \
                .select("id, updated_at, retry_count, current_stage") \
                .eq("status", "in_progress") \
                .lt("updated_at", five_minutes_ago) \
                .execute()
            
            if not result.data or len(result.data) == 0:
                return
            
            for job in result.data:
                job_id = job["id"]
                retry_count = job.get("retry_count", 0)
                current_stage = job.get("current_stage", "unknown")
                
                print(f"\n⚠️  Job bloqué détecté: {job_id}")
                print(f"    Stage: {current_stage}")
                print(f"    Retry: {retry_count}/{self.settings.MAX_RETRIES}")
                
                if retry_count < self.settings.MAX_RETRIES:
                    print(f"    → RETRY AUTOMATIQUE ({retry_count + 1}/{self.settings.MAX_RETRIES})")
                    self.supabase.client.table("jobs").update({
                        "status": "pending",
                        "retry_count": retry_count + 1,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", job_id).execute()
                else:
                    print(f"    → MAX RETRIES ATTEINT - Job marqué comme échoué")
                    self.supabase.client.table("jobs").update({
                        "status": "failed",
                        "error_message": f"Job bloqué à '{current_stage}' après {retry_count} tentatives",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", job_id).execute()
        
        except Exception as e:
            print(f"[ERREUR] Récupération jobs bloqués: {str(e)}")
    
    def stop(self):
        """Arrête le worker"""
        self.running = False


async def main():
    """Point d'entrée du worker"""
    
    poll_interval = 10
    
    if len(sys.argv) > 1:
        try:
            poll_interval = int(sys.argv[1])
        except ValueError:
            print(f"Intervalle invalide: {sys.argv[1]}")
            print("Usage: python -m workers.worker [intervalle_secondes]")
            sys.exit(1)
    
    worker = AlphogenAIWorker(poll_interval=poll_interval)
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        print("\nArrêt en cours...")
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
