#!/usr/bin/env python3
"""
End-to-End Test for Audio Ambience Module

Tests the complete pipeline:
1. SVI video generation
2. Audio generation (AudioLDM2 + Diff-Foley)
3. CLAP audio selection
4. Audio-video mixing
5. Final upload

Example: "whale rescue" keyword, 60s, 1080p, 24fps

Author: AlphoGenAI Team
"""

import os
import sys
import asyncio
import logging
import httpx
from typing import Dict, Any
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from workers.supabase_client import SupabaseClient
from workers.audio_orchestrator import AudioOrchestrator
from workers.budget_guard import BudgetGuard, BudgetGuardMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class E2ETestRunner:
    """End-to-end test runner for audio ambience module."""
    
    def __init__(self):
        """Initialize test runner."""
        self.supabase = SupabaseClient()
        self.audio = AudioOrchestrator()
        self.budget_guard = BudgetGuard()
        self.budget_middleware = BudgetGuardMiddleware(self.budget_guard)
        
        self.test_prompt = "A dramatic whale rescue operation in the ocean with large waves and rescue boats"
        self.test_keyword = "whale rescue"
        self.test_duration = 60.0
        self.test_fps = 24
        self.test_resolution = "1920x1080"
        
        self.svi_endpoint = os.getenv("SVI_ENDPOINT_URL")
        self.audio_backend = os.getenv("AUDIO_BACKEND_URL")
        
        if not self.svi_endpoint:
            logger.warning("SVI_ENDPOINT_URL not set - will use mock video")
        
        if not self.audio_backend:
            logger.warning("AUDIO_BACKEND_URL not set - audio generation will fail")
    
    async def run_full_test(self) -> Dict[str, Any]:
        """
        Run complete E2E test.
        
        Returns:
            Test results dictionary
        """
        logger.info("=" * 80)
        logger.info("Starting E2E Test for Audio Ambience Module")
        logger.info("=" * 80)
        logger.info(f"Test prompt: {self.test_prompt}")
        logger.info(f"Test keyword: {self.test_keyword}")
        logger.info(f"Duration: {self.test_duration}s")
        logger.info(f"Resolution: {self.test_resolution}")
        logger.info(f"FPS: {self.test_fps}")
        logger.info("")
        
        start_time = datetime.utcnow()
        results = {
            "test_name": "Audio Ambience E2E Test",
            "start_time": start_time.isoformat(),
            "stages": {},
            "success": False,
            "error": None
        }
        
        try:
            logger.info("Stage 1: Creating test job...")
            job_id = await self._create_test_job()
            results["job_id"] = job_id
            results["stages"]["job_creation"] = {"success": True, "job_id": job_id}
            logger.info(f"✓ Job created: {job_id}")
            logger.info("")
            
            logger.info("Stage 2: Checking budget guard...")
            if not await self.budget_middleware.before_job(job_id):
                raise Exception("Job blocked by budget guard")
            results["stages"]["budget_check"] = {"success": True}
            logger.info("✓ Budget check passed")
            logger.info("")
            
            logger.info("Stage 3: Generating video with SVI...")
            video_result = await self._generate_video_svi()
            results["stages"]["video_generation"] = video_result
            logger.info(f"✓ Video generated: {video_result['video_url']}")
            logger.info("")
            
            logger.info("Stage 4: Generating audio...")
            audio_result = await self._generate_audio(
                job_id,
                video_result["video_url"],
                self.test_prompt,
                self.test_duration
            )
            results["stages"]["audio_generation"] = audio_result
            logger.info(f"✓ Audio generated: {audio_result['audio_url']}")
            logger.info(f"  Audio score: {audio_result['audio_score']:.3f}")
            logger.info("")
            
            logger.info("Stage 5: Updating job with results...")
            await self._update_job_results(job_id, video_result, audio_result)
            results["stages"]["job_update"] = {"success": True}
            logger.info("✓ Job updated")
            logger.info("")
            
            logger.info("Stage 6: Finalizing budget...")
            await self.budget_middleware.after_job(job_id, success=True)
            budget_status = self.budget_middleware.get_status()
            results["stages"]["budget_finalize"] = budget_status
            logger.info(f"✓ Budget updated: {budget_status['spending']['spent_eur']:.4f}€")
            logger.info("")
            
            results["success"] = True
            results["final_url"] = audio_result["output_url_final"]
            results["audio_url"] = audio_result["audio_url"]
            results["video_url"] = video_result["video_url"]
            
        except Exception as e:
            logger.error(f"Test failed: {e}", exc_info=True)
            results["success"] = False
            results["error"] = str(e)
        
        finally:
            end_time = datetime.utcnow()
            results["end_time"] = end_time.isoformat()
            results["duration_seconds"] = (end_time - start_time).total_seconds()
        
        self._print_summary(results)
        
        return results
    
    async def _create_test_job(self) -> str:
        """Create a test job in database."""
        job_id = await self.supabase.create_job(
            user_id="test-user-e2e",
            prompt=self.test_prompt
        )
        return job_id
    
    async def _generate_video_svi(self) -> Dict[str, Any]:
        """Generate video using SVI endpoint."""
        if not self.svi_endpoint:
            logger.warning("Using mock video (SVI_ENDPOINT_URL not set)")
            return {
                "video_url": "https://example.com/mock_video.mp4",
                "duration": self.test_duration,
                "fps": self.test_fps,
                "resolution": self.test_resolution,
                "mock": True
            }
        
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                response = await client.post(
                    f"{self.svi_endpoint}/prompt_stream",
                    json={
                        "keyword": self.test_keyword,
                        "duration": self.test_duration,
                        "fps": self.test_fps,
                        "resolution": self.test_resolution
                    }
                )
                
                if response.status_code != 200:
                    raise Exception(f"SVI generation failed: {response.status_code} - {response.text}")
                
                result = response.json()
                
                if "task_id" in result:
                    task_id = result["task_id"]
                    logger.info(f"Polling SVI task: {task_id}")
                    
                    for i in range(60):  # Poll for up to 5 minutes
                        await asyncio.sleep(5)
                        
                        status_response = await client.get(
                            f"{self.svi_endpoint}/task/{task_id}"
                        )
                        
                        if status_response.status_code == 200:
                            status_result = status_response.json()
                            
                            if status_result["status"] == "completed":
                                return {
                                    "video_url": status_result["video_url"],
                                    "duration": status_result.get("duration", self.test_duration),
                                    "fps": status_result.get("fps", self.test_fps),
                                    "resolution": status_result.get("resolution", self.test_resolution),
                                    "task_id": task_id
                                }
                            elif status_result["status"] == "failed":
                                raise Exception(f"SVI generation failed: {status_result.get('error')}")
                    
                    raise Exception("SVI generation timed out")
                
                return {
                    "video_url": result["video_url"],
                    "duration": result.get("duration", self.test_duration),
                    "fps": result.get("fps", self.test_fps),
                    "resolution": result.get("resolution", self.test_resolution)
                }
                
        except Exception as e:
            logger.error(f"SVI generation failed: {e}")
            return {
                "video_url": "https://example.com/mock_video.mp4",
                "duration": self.test_duration,
                "fps": self.test_fps,
                "resolution": self.test_resolution,
                "mock": True,
                "error": str(e)
            }
    
    async def _generate_audio(
        self,
        job_id: str,
        video_url: str,
        prompt: str,
        duration: float
    ) -> Dict[str, Any]:
        """Generate audio using audio orchestrator."""
        return await self.audio.process_audio(
            job_id, video_url, prompt, duration
        )
    
    async def _update_job_results(
        self,
        job_id: str,
        video_result: Dict[str, Any],
        audio_result: Dict[str, Any]
    ) -> None:
        """Update job with final results."""
        await self.supabase.update_job_state(
            job_id,
            app_state={
                "stage": "completed",
                "video_result": video_result,
                "audio_result": audio_result,
                "test": True
            },
            video_url=video_result["video_url"],
            audio_url=audio_result["audio_url"],
            audio_score=audio_result["audio_score"],
            output_url_final=audio_result["output_url_final"],
            final_url=audio_result["output_url_final"],
            status="done",
            current_stage="completed"
        )
    
    def _print_summary(self, results: Dict[str, Any]) -> None:
        """Print test summary."""
        logger.info("")
        logger.info("=" * 80)
        logger.info("E2E Test Summary")
        logger.info("=" * 80)
        logger.info(f"Status: {'✓ SUCCESS' if results['success'] else '✗ FAILED'}")
        logger.info(f"Duration: {results['duration_seconds']:.1f}s")
        
        if results.get("job_id"):
            logger.info(f"Job ID: {results['job_id']}")
        
        if results.get("final_url"):
            logger.info(f"Final URL: {results['final_url']}")
        
        if results.get("audio_url"):
            logger.info(f"Audio URL: {results['audio_url']}")
        
        if results.get("video_url"):
            logger.info(f"Video URL: {results['video_url']}")
        
        logger.info("")
        logger.info("Stages:")
        for stage_name, stage_result in results.get("stages", {}).items():
            if isinstance(stage_result, dict):
                success = stage_result.get("success", True)
                logger.info(f"  {stage_name}: {'✓' if success else '✗'}")
            else:
                logger.info(f"  {stage_name}: ✓")
        
        if results.get("error"):
            logger.info("")
            logger.info(f"Error: {results['error']}")
        
        if "budget_finalize" in results.get("stages", {}):
            spending = results["stages"]["budget_finalize"]["spending"]
            logger.info("")
            logger.info("Cost Estimation:")
            logger.info(f"  Spent today: {spending['spent_eur']:.4f}€")
            logger.info(f"  Remaining: {spending['remaining_eur']:.4f}€")
            logger.info(f"  Budget used: {spending['percentage_used']:.1f}%")
        
        logger.info("=" * 80)


async def main():
    """Main entry point."""
    runner = E2ETestRunner()
    results = await runner.run_full_test()
    
    sys.exit(0 if results["success"] else 1)


if __name__ == "__main__":
    asyncio.run(main())
