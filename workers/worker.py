"""
Worker background qui traite les jobs AlphogenAI Mini
"""
import asyncio
import signal
import sys
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from .supabase_client import SupabaseClient
from .svi_client import SVIClient
from .audio_orchestrator import AudioOrchestrator
from .ffmpeg_assembler import FFmpegAssembler
from .budget_guard import BudgetGuard, BudgetGuardMiddleware
from .config import get_settings
from .r2_uploader import upload_file_to_r2

logger = logging.getLogger(__name__)


class AlphogenAIWorker:
    """Worker qui poll la table jobs et exécute l'orchestrateur"""

    def __init__(self, poll_interval: int = 10):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.svi_client = SVIClient() if self.settings.SVI_ENDPOINT_URL else None
        self.audio_orchestrator = AudioOrchestrator() if self.settings.AUDIO_BACKEND_URL else None
        self.ffmpeg_assembler = FFmpegAssembler()
        self.budget_guard = BudgetGuard()
        self.budget_middleware = BudgetGuardMiddleware(self.budget_guard)
        self.poll_interval = poll_interval
        self.running = False
        self.current_job_id: Optional[str] = None

    async def start(self):
        """Démarre le worker"""
        self.running = True

        logger.info("=" * 60)
        logger.info("AlphogenAI Mini Worker")
        logger.info("=" * 60)
        logger.info(f"Démarré: {datetime.now(timezone.utc).isoformat()}")
        logger.info(f"Intervalle de poll: {self.poll_interval}s")
        logger.info(f"Retries max: {self.settings.MAX_RETRIES}")
        logger.info(f"Budget: cap={self.budget_guard.config.daily_budget_hardcap_eur}€, "
                     f"concurrency={self.budget_guard.config.max_concurrency}")
        logger.info("=" * 60)
        logger.info("En attente de jobs...")

        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        while self.running:
            try:
                await self._process_pending_jobs()
                await asyncio.sleep(self.poll_interval)

            except KeyboardInterrupt:
                logger.info("Interruption reçue...")
                break
            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(self.poll_interval)

        logger.info("Worker arrêté.")

    def _signal_handler(self, signum, frame):
        """Arrêt gracieux"""
        logger.info(f"Signal {signum} reçu")
        self.running = False

        if self.current_job_id:
            logger.info(f"Job {self.current_job_id} sera marqué comme échoué")

    async def _process_pending_jobs(self):
        """Poll et traite les jobs en attente + récupération des jobs bloqués"""

        # Étape 1: Récupérer les jobs bloqués
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

        logger.info(f"Traitement du job: {job['id']}")
        logger.info(f"Utilisateur: {job.get('user_id', 'anonymous')}")
        logger.info(f"Prompt: {job['prompt'][:80]}...")
        logger.info(f"Plan: {job.get('plan', 'free')}")

        # Budget guard check
        if not await self.budget_middleware.before_job(job["id"]):
            self.supabase.update_job_state(
                job["id"],
                status="failed",
                error_message="Budget limit reached - job blocked by budget guard"
            )
            self.current_job_id = None
            return

        success = False
        try:
            # Marquer comme in_progress
            self.supabase.update_job_state(
                job["id"],
                status="in_progress",
                current_stage="generating_video"
            )

            # Génération vidéo
            video_url = None
            if self.svi_client:
                logger.info("Génération vidéo avec SVI...")
                video_result = await self.svi_client.generate_video(
                    prompt=job["prompt"],
                    duration_sec=60,
                    resolution="1920x1080",
                    fps=24
                )
                video_url = video_result.get("video_url")
                logger.info(f"Vidéo générée: {video_url}")

                self.supabase.update_job_state(
                    job["id"],
                    current_stage="generating_audio",
                    video_url=video_url
                )

            # Génération audio + mixage
            audio_url = None
            output_url_final = video_url
            if self.audio_orchestrator and video_url and self.settings.AUDIO_MODE == "auto":
                # Vérifier le timeout budget en cours de route
                if await self.budget_middleware.check_timeout(job["id"]):
                    raise TimeoutError(
                        f"Job timeout exceeded ({self.budget_guard.config.max_runtime_per_job}s)"
                    )

                logger.info("Génération audio...")
                self.supabase.update_job_state(
                    job["id"],
                    current_stage="generating_audio"
                )

                audio_result = await self.audio_orchestrator.process_audio(
                    job_id=job["id"],
                    video_url=video_url,
                    prompt=job["prompt"],
                    duration=60.0
                )
                audio_url = audio_result.get("audio_url")
                audio_score = audio_result.get("audio_score", 0.0)

                # Mixage audio + vidéo via FFmpeg
                if audio_url and video_url:
                    logger.info("Mixage audio + vidéo...")
                    self.supabase.update_job_state(
                        job["id"],
                        current_stage="mixing"
                    )

                    mixed_path = await self.ffmpeg_assembler.assemble_clips(
                        clip_urls=[video_url],
                        music_url=audio_url,
                        output_filename=f"job_{job['id']}_final.mp4"
                    )
                    logger.info(f"Audio mixé (score: {audio_score:.3f}), fichier: {mixed_path}")

                    # Upload mixed file to R2
                    r2_key = f"videos/{job['id']}_final.mp4"
                    r2_url = upload_file_to_r2(mixed_path, r2_key)
                    if r2_url:
                        output_url_final = r2_url
                        logger.info(f"Mixed video uploaded to R2: {r2_url}")
                    else:
                        output_url_final = video_url
                        logger.warning("R2 upload skipped — using original video URL")
                else:
                    output_url_final = video_url

            # Upload stage
            self.supabase.update_job_state(
                job["id"],
                current_stage="uploading"
            )

            # Marquer comme terminé
            self.supabase.update_job_state(
                job["id"],
                app_state={"stage": "completed"},
                status="done",
                video_url=video_url,
                audio_url=audio_url,
                output_url_final=output_url_final,
                final_url=output_url_final,
                current_stage="completed"
            )

            success = True
            logger.info(f"Job {job['id']} terminé avec succès!")
            if video_url:
                logger.info(f"Vidéo: {video_url}")
            if audio_url:
                logger.info(f"Audio: {audio_url}")
            logger.info(f"Final: {output_url_final}")

        except Exception as e:
            logger.error(f"Job {job['id']} échoué: {e}")
            self.supabase.update_job_state(
                job["id"],
                status="failed",
                error_message=str(e)
            )

        finally:
            await self.budget_middleware.after_job(job["id"], success=success)
            self.current_job_id = None

    async def _recover_stuck_jobs(self):
        """Récupère les jobs bloqués en in_progress depuis > 5 minutes"""
        try:
            five_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

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

                logger.warning(f"Job bloqué détecté: {job_id} (stage: {current_stage}, retry: {retry_count}/{self.settings.MAX_RETRIES})")

                if retry_count < self.settings.MAX_RETRIES:
                    logger.info(f"Retry automatique ({retry_count + 1}/{self.settings.MAX_RETRIES})")
                    self.supabase.client.table("jobs").update({
                        "status": "pending",
                        "retry_count": retry_count + 1,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", job_id).execute()
                else:
                    logger.error(f"Max retries atteint pour {job_id} - marqué comme échoué")
                    self.supabase.client.table("jobs").update({
                        "status": "failed",
                        "error_message": f"Job bloqué à '{current_stage}' après {retry_count} tentatives",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", job_id).execute()

        except Exception as e:
            logger.error(f"Récupération jobs bloqués: {e}")

    def stop(self):
        """Arrête le worker"""
        self.running = False


async def main():
    """Point d'entrée du worker"""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    poll_interval = 10

    if len(sys.argv) > 1:
        try:
            poll_interval = int(sys.argv[1])
        except ValueError:
            logger.error(f"Intervalle invalide: {sys.argv[1]}")
            logger.info("Usage: python -m workers.worker [intervalle_secondes]")
            sys.exit(1)

    worker = AlphogenAIWorker(poll_interval=poll_interval)

    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("Arrêt en cours...")
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
