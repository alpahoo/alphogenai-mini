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
from .video_assembly_service import VideoAssemblyService


class RunwayOrchestrator:
    """Simplified orchestrator: Qwen Mock → Runway Gen-4 → Music → Done"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.runway = RunwayService()
        self.qwen = QwenMockService()
        self.video_assembly = VideoAssemblyService()
    
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str
    ) -> Dict[str, Any]:
        """
        Execute the complete video generation workflow
        
        Workflow:
        1. Check job type (video_generation or video_assembly)
        2a. For video_generation: Generate script → Runway → Music → Done
        2b. For video_assembly: Assemble scenes with ffmpeg → Upload → Done
        """
        print(f"\n{'='*70}")
        print(f"🎬 Runway Orchestrator - Starting workflow")
        print(f"{'='*70}")
        print(f"Job ID: {job_id}")
        print(f"Prompt: {prompt}")
        print(f"{'='*70}\n")
        
        try:
            # Get job details to determine type
            job_data = await self.supabase.get_job(job_id)
            app_state = job_data.get("app_state", {})
            job_type = app_state.get("type", "video_generation")
            
            if job_type == "video_assembly":
                return await self._handle_video_assembly(job_id, app_state)
            else:
                return await self._handle_video_generation(job_id, user_id, prompt)
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
    
    async def _handle_video_generation(
        self,
        job_id: str,
        user_id: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Handle standard video generation workflow"""
        await self._update_stage(job_id, "script_generation", "in_progress")
        script = await self.qwen.generate_script(prompt)
        
        await self._update_stage(job_id, "video_generation", "in_progress")
        
        scene = script["scenes"][0]
        video_prompt = scene["description"]
        
        video_result = await self.runway.generate_video(
            prompt=video_prompt,
            duration=8,
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
                "duration": 8,
                "model": "gen4_turbo",
                "cost_credits": 8 * 5,  # 5 credits per second for gen4_turbo
                "tone": tone,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        
        print(f"\n{'='*70}")
        print(f"✅ Video generation completed successfully!")
        print(f"Video: {final_url}")
        print(f"{'='*70}\n")
        
        return {
            "status": "success",
            "job_id": job_id,
            "video_url": final_url,
            "music_url": music_url,
        }
    
    async def _handle_video_assembly(
        self,
        job_id: str,
        app_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Handle video assembly workflow"""
        project_id = app_state.get("project_id")
        scenes = app_state.get("scenes", [])
        
        if not project_id or not scenes:
            raise ValueError("Invalid video assembly job: missing project_id or scenes")
        
        print(f"[Orchestrator] Assembling video for project {project_id}")
        print(f"[Orchestrator] Scenes: {len(scenes)}")
        
        await self._update_stage(job_id, "video_assembly", "in_progress")
        
        # Assemble video with ffmpeg
        assembly_result = await self.video_assembly.assemble_project_video(
            scenes=scenes,
            project_id=project_id,
            output_format="webm"
        )
        
        # TODO: Upload final video and thumbnail to Supabase Storage
        # For now, we'll store local paths
        final_video_path = assembly_result["final_video_path"]
        thumbnail_path = assembly_result["thumbnail_path"]
        
        await self._update_stage(job_id, "upload", "in_progress")
        
        # Update project with final paths
        await self.supabase.client.table("projects").update({
            "final_video_path": final_video_path,
            "thumbnail_path": thumbnail_path,
            "status": "ready",
            "cost_credits": len(scenes) * 5  # 5 credits per scene for gen4_turbo
        }).eq("id", project_id).execute()
        
        # Update job as completed
        await self.supabase.update_job_state(
            job_id=job_id,
            app_state={
                **app_state,
                "assembly_result": assembly_result,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
            status="done",
            current_stage="completed",
            final_url=final_video_path
        )
        
        print(f"\n{'='*70}")
        print(f"✅ Video assembly completed successfully!")
        print(f"Final video: {final_video_path}")
        print(f"Thumbnail: {thumbnail_path}")
        print(f"{'='*70}\n")
        
        return {
            "status": "success",
            "job_id": job_id,
            "project_id": project_id,
            "final_video_path": final_video_path,
            "thumbnail_path": thumbnail_path,
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
