"""
Worker background qui traite les jobs AlphogenAI Mini
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

from .supabase_client import SupabaseClient
from .svi_client import SVIClient
from .audio_orchestrator import AudioOrchestrator
from .config import get_settings


class AlphogenAIWorker:
    """Worker qui poll la table jobs et exécute l'orchestrateur"""
    
    def __init__(self, poll_interval: int = 10):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.svi_client = SVIClient() if self.settings.SVI_ENDPOINT_URL else None
        self.audio_orchestrator = AudioOrchestrator() if self.settings.AUDIO_BACKEND_URL else None
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

            # Cache prompt -> video_url final (évite de régénérer)
            cached = await self.supabase.get_from_cache(job["prompt"])
            if cached and cached.get("video_url"):
                cached_url = cached["video_url"]
                print(f"⚡ Cache HIT: {cached_url}")
                await self.supabase.update_job_state(
                    job_id=job["id"],
                    app_state={**(job.get("app_state") or {}), "stage": "cached_hit", "cached": True, "prompt_hash": cached.get("prompt_hash")},
                    status="done",
                    current_stage="completed",
                    video_url=cached_url,
                    final_url=cached_url,
                    output_url_final=cached_url,
                )
                print(f"\n✅ Job {job['id']} terminé (cache)!")
                print(f"Final: {cached_url}\n")
                return
            
            # Lire les paramètres depuis app_state (si fournis par l'API)
            app_state = job.get("app_state") or {}
            duration_sec = int(app_state.get("duration_sec") or self.settings.SVI_DURATION_SEC if hasattr(self.settings, "SVI_DURATION_SEC") else 60)
            resolution = str(app_state.get("resolution") or "1920x1080")
            fps = int(app_state.get("fps") or 24)
            seed = app_state.get("seed")

            video_url = None
            if self.svi_client:
                print("🎬 Génération vidéo avec SVI...")
                video_result = self.svi_client.generate_video(
                    prompt=job["prompt"],
                    duration_sec=duration_sec,
                    resolution=resolution,
                    fps=fps,
                    seed=seed,
                    mode=(self.settings.SVI_MODE if hasattr(self.settings, "SVI_MODE") and self.settings.SVI_MODE else "film"),
                )
                video_url = video_result.get("video_url")
                print(f"✅ Vidéo générée: {video_url}")
                
                await self.supabase.update_job_state(
                    job_id=job["id"],
                    app_state={**app_state, "stage": "video_generated"},
                    status="in_progress",
                    video_url=video_url,
                    current_stage="video_generated",
                )
            
            # Generate audio with Audio Orchestrator
            audio_url = None
            output_url_final = video_url
            audio_score = None
            if self.audio_orchestrator and video_url and self.settings.AUDIO_MODE == "auto":
                print("🎵 Génération audio...")
                audio_result = await self.audio_orchestrator.process_audio(
                    job_id=job["id"],
                    video_url=video_url,
                    prompt=job["prompt"],
                    duration=float(duration_sec)
                )
                audio_url = audio_result.get("audio_url")
                output_url_final = audio_result.get("output_url_final", video_url)
                audio_score = audio_result.get("audio_score")
                if audio_url:
                    score_disp = f"{float(audio_score):.3f}" if audio_score is not None else "N/A"
                    print(f"✅ Audio généré: {audio_url} (score: {score_disp})")
            
            await self.supabase.update_job_state(
                job_id=job["id"],
                app_state={**app_state, "stage": "completed"},
                status="done",
                video_url=video_url,
                audio_url=audio_url,
                audio_score=audio_score,
                output_url_final=output_url_final,
                final_url=output_url_final,
                current_stage="completed",
            )

            # Sauvegarder dans le cache (on cache l'output final)
            if output_url_final:
                await self.supabase.save_to_cache(
                    prompt=job["prompt"],
                    video_url=output_url_final,
                    metadata={
                        "resolution": resolution,
                        "fps": fps,
                        "duration_sec": duration_sec,
                        "has_audio": bool(audio_url),
                    },
                )
            
            print(f"\n✅ Job {job['id']} terminé avec succès!")
            print(f"Vidéo: {video_url}")
            if audio_url:
                print(f"Audio: {audio_url}")
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
