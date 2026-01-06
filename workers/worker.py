"""
Worker background qui traite les jobs AlphogenAI Mini
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

from .supabase_client import SupabaseClient
from .config import get_settings
from .video_backend import VideoRequest, get_video_backend


class AlphogenAIWorker:
    """Worker qui poll la table jobs et exécute l'orchestrateur"""
    
    def __init__(self, poll_interval: int = 10):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.video_backend = get_video_backend()
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
                job_id=job["id"],
                app_state={**(job.get("app_state") or {}), "stage": "starting"},
                status="in_progress",
                current_stage="starting",
            )

            # Lire les paramètres depuis app_state (si fournis par l'API)
            app_state = job.get("app_state") or {}
            duration_sec = int(app_state.get("duration_sec") or 60)
            resolution = str(app_state.get("resolution") or "1920x1080")
            fps = int(app_state.get("fps") or 24)
            seed = app_state.get("seed")

            cache_key = self.supabase.compute_cache_key(
                job["prompt"],
                duration_sec=duration_sec,
                fps=fps,
                resolution=resolution,
                seed=None if seed is None else int(seed),
            )

            # Cache prompt + params -> final_url
            cached = await self.supabase.get_from_cache(cache_key)
            if cached and cached.get("video_url"):
                cached_url = cached["video_url"]
                print(f"⚡ Cache HIT: {cached_url}")
                await self.supabase.update_job_state(
                    job_id=job["id"],
                    app_state={**app_state, "stage": "cached_hit", "cached": True, "cache_key": cache_key},
                    status="done",
                    current_stage="completed",
                    video_url=cached_url,
                    final_url=cached_url,
                )
                print(f"\n✅ Job {job['id']} terminé (cache)!")
                print(f"Final: {cached_url}\n")
                return

            print(f"🎬 Génération vidéo via backend='{self.settings.VIDEO_BACKEND}'...")
            video_url = self.video_backend.generate_video(
                VideoRequest(
                    prompt=job["prompt"],
                    duration_sec=duration_sec,
                    fps=fps,
                    resolution=resolution,
                    seed=None if seed is None else int(seed),
                )
            )
            output_url_final = video_url
            print(f"✅ Vidéo générée: {output_url_final}")

            await self.supabase.update_job_state(
                job_id=job["id"],
                app_state={**app_state, "stage": "video_generated"},
                status="in_progress",
                video_url=output_url_final,
                current_stage="video_generated",
            )
            
            await self.supabase.update_job_state(
                job_id=job["id"],
                app_state={**app_state, "stage": "completed"},
                status="done",
                video_url=output_url_final,
                output_url_final=output_url_final,
                final_url=output_url_final,
                current_stage="completed",
            )

            # Sauvegarder dans le cache (on cache l'output final)
            if output_url_final:
                await self.supabase.save_to_cache(
                    cache_key=cache_key,
                    video_url=output_url_final,
                    metadata={
                        "prompt": job["prompt"],
                        "resolution": resolution,
                        "fps": fps,
                        "duration_sec": duration_sec,
                        "seed": seed,
                    },
                )
            
            print(f"\n✅ Job {job['id']} terminé avec succès!")
            print(f"Final: {output_url_final}\n")
            
        except Exception as e:
            print(f"\n❌ Job {job['id']} échoué avec exception: {str(e)}\n")
            await self.supabase.update_job_state(
                job_id=job["id"],
                app_state={**(job.get("app_state") or {}), "stage": "failed"},
                status="failed",
                current_stage="failed",
                error_message=str(e),
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
    
    run_once = False
    if "--once" in sys.argv:
        run_once = True
        sys.argv = [a for a in sys.argv if a != "--once"]

    if len(sys.argv) > 1:
        try:
            poll_interval = int(sys.argv[1])
        except ValueError:
            print(f"Intervalle invalide: {sys.argv[1]}")
            print("Usage: python -m workers.worker [intervalle_secondes] [--once]")
            sys.exit(1)
    
    worker = AlphogenAIWorker(poll_interval=poll_interval)
    
    try:
        if run_once:
            worker.running = True
            await worker._process_pending_jobs()
            worker.running = False
        else:
            await worker.start()
    except KeyboardInterrupt:
        print("\nArrêt en cours...")
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
