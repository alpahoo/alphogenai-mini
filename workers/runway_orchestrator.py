"""
Simplified orchestrator for Runway Gen-4 Turbo workflow
Replaces LangGraph with direct async workflow
"""
import asyncio
from typing import Dict, Any
from datetime import datetime, timezone

from .config import get_settings
from .supabase_client import SupabaseClient
from .runway_service import RunwayService
from .qwen_mock_service import QwenMockService
from .music_selector import select_music_for_job


class RunwayOrchestrator:
    """Simplified orchestrator: Qwen Mock → Runway Gen-4 → Music → Done"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.runway = RunwayService()
        self.qwen = QwenMockService()
    
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str
    ) -> Dict[str, Any]:
        """
        Execute the complete video generation workflow
        
        Workflow:
        1. Generate script with Qwen mock
        2. Generate video with Runway Gen-4
        3. Select music from Supabase Storage
        4. Combine video + music (if supported)
        5. Update job with final video URL
        """
        print(f"\n{'='*70}")
        print(f"🎬 Runway Orchestrator - Starting workflow")
        print(f"{'='*70}")
        print(f"Job ID: {job_id}")
        print(f"Prompt: {prompt}")
        print(f"{'='*70}\n")
        
        try:
            await self._update_stage(job_id, "script_generation", "in_progress")
            script = await self.qwen.generate_script(prompt)
            
            await self._update_stage(job_id, "video_generation", "in_progress")
            
            scene = script["scenes"][0]
            video_prompt = scene["description"]
            
            video_result = await self.runway.generate_video(
                prompt=video_prompt,
                duration=16,
                aspect_ratio="16:9"
            )
            
            video_url = video_result["video_url"]
            
            await self._update_stage(job_id, "music_selection", "in_progress")
            
            tone = script.get("tone", "inspiring")
            music_url = await select_music_for_job(
                supabase_client=self.supabase,
                prompt=prompt,
                tone=tone,
                supabase_url=self.settings.SUPABASE_URL
            )
            
            final_url = video_url
            
            if music_url:
                print(f"[Orchestrator] Music selected: {music_url[:60]}...")
                print(f"[Orchestrator] Note: Music overlay not yet implemented")
            
            await self.supabase.update_job_state(
                job_id=job_id,
                app_state={
                    "prompt": prompt,
                    "script": script,
                    "video": video_result,
                    "music_url": music_url,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
                status="done",
                current_stage="completed",
                video_url=final_url,
                final_url=final_url
            )
            
            await self.supabase.save_to_cache(
                prompt=prompt,
                video_url=final_url,
                metadata={
                    "duration": 16,
                    "model": self.runway.model,
                    "tone": tone,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            
            print(f"\n{'='*70}")
            print(f"✅ Workflow completed successfully!")
            print(f"Video: {final_url}")
            print(f"{'='*70}\n")
            
            return {
                "status": "success",
                "job_id": job_id,
                "video_url": final_url,
                "music_url": music_url,
            }
            
        except Exception as e:
            print(f"\n{'='*70}")
            print(f"❌ Workflow failed")
            print(f"Error: {str(e)}")
            print(f"{'='*70}\n")
            
            await self.supabase.update_job_state(
                job_id=job_id,
                app_state={"error": str(e)},
                status="failed",
                error_message=str(e)
            )
            
            return {
                "status": "failed",
                "job_id": job_id,
                "error": str(e),
            }
    
    async def _update_stage(
        self,
        job_id: str,
        stage: str,
        status: str
    ) -> None:
        """Update job stage in database"""
        await self.supabase.update_job_state(
            job_id=job_id,
            app_state={},
            status=status,
            current_stage=stage
        )


async def create_and_run_job(
    user_id: str,
    prompt: str
) -> Dict[str, Any]:
    """
    High-level function to create and execute a job
    
    Usage:
        result = await create_and_run_job(
            user_id="user_123",
            prompt="Un robot découvre la mer"
        )
    """
    supabase = SupabaseClient()
    
    job_id = await supabase.create_job(
        user_id=user_id,
        prompt=prompt,
        initial_state={"created_at": datetime.now(timezone.utc).isoformat()}
    )
    
    orchestrator = RunwayOrchestrator()
    result = await orchestrator.run(job_id, user_id, prompt)
    
    return result


if __name__ == "__main__":
    import sys
    
    async def main():
        if len(sys.argv) < 2:
            print("Usage: python -m workers.runway_orchestrator <prompt>")
            sys.exit(1)
        
        prompt = " ".join(sys.argv[1:])
        result = await create_and_run_job(
            user_id="test_user",
            prompt=prompt
        )
        
        print("\n=== Résultat Final ===")
        print(f"Status: {result['status']}")
        if result['status'] == 'success':
            print(f"Vidéo URL: {result['video_url']}")
        else:
            print(f"Erreur: {result['error']}")
    
    asyncio.run(main())
