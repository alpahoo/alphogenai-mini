"""
Simplified orchestrator for Runway Gen-4 Turbo multi-clip workflow
Replaces expensive veo3 with cost-effective gen4_turbo image-to-video
"""
import asyncio
import random
from typing import Dict, Any
from datetime import datetime, timezone
from pathlib import Path

from .config import get_settings
from .supabase_client import SupabaseClient
from .runway_service import RunwayService
from .runway_image_service import RunwayImageService
from .ffmpeg_assembler import FFmpegAssembler
from .qwen_mock_service import QwenMockService
from .music_selector import select_music_for_job


class RunwayOrchestrator:
    """Multi-clip orchestrator: Qwen → gen4_image_turbo → gen4_turbo → FFmpeg → Music → Done"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.runway_video = RunwayService()
        self.runway_image = RunwayImageService()
        self.ffmpeg = FFmpegAssembler()
        self.qwen = QwenMockService()
    
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str,
        seed: int = None
    ) -> Dict[str, Any]:
        """
        Execute the complete 60-second video generation workflow
        
        Workflow:
        1. Generate 6-scene script with Qwen
        2. For each scene:
           a. Generate image with gen4_image_turbo (seed + scene_number)
           b. Animate image with gen4_turbo (seed + scene_number)
        3. Assemble all clips with FFmpeg
        4. Select and overlay music
        5. Upload final video to Supabase Storage
        6. Update job with final URL
        
        Cost per 60s video: ~$3.12 (312 credits)
        - 6 images × 2 credits = 12 credits
        - 6 videos × 50 credits = 300 credits
        """
        print(f"\n{'='*70}")
        print(f"🎬 Runway Multi-Clip Orchestrator - Starting workflow")
        print(f"{'='*70}")
        print(f"Job ID: {job_id}")
        print(f"Prompt: {prompt}")
        print(f"Target: 60-second video (6 clips of 10s each)")
        print(f"{'='*70}\n")
        
        try:
            if seed is None:
                seed = random.randint(0, 4294967295)
            print(f"[Orchestrator] Base seed: {seed}")
            
            await self._update_stage(job_id, "script_generation", "in_progress")
            script = await self.qwen.generate_script(prompt)
            
            print(f"\n[Orchestrator] Script generated:")
            print(f"  Title: {script['title']}")
            print(f"  Tone: {script['tone']}")
            print(f"  Scenes: {len(script['scenes'])}")
            
            await self._update_stage(job_id, "video_generation", "in_progress")
            
            clip_urls = []
            clip_metadata = []
            
            for i, scene in enumerate(script["scenes"]):
                scene_seed = seed + i
                print(f"\n{'='*70}")
                print(f"Scene {i+1}/{len(script['scenes'])}: {scene['description'][:60]}...")
                print(f"{'='*70}")
                
                image_result = await self.runway_image.generate_image(
                    prompt=scene["description"],
                    seed=scene_seed,
                    aspect_ratio=script["aspect_ratio"]
                )
                
                video_result = await self.runway_video.generate_video(
                    image_url=image_result["image_url"],
                    prompt=scene["description"],
                    duration=scene["duration"],
                    seed=scene_seed,
                    aspect_ratio=script["aspect_ratio"]
                )
                
                clip_urls.append(video_result["video_url"])
                clip_metadata.append({
                    "scene_number": i + 1,
                    "image_url": image_result["image_url"],
                    "video_url": video_result["video_url"],
                    "seed": scene_seed,
                    "description": scene["description"]
                })
                
                print(f"✓ Scene {i+1} complete")
            
            await self._update_stage(job_id, "video_assembly", "in_progress")
            
            print(f"\n{'='*70}")
            print(f"Assembling {len(clip_urls)} clips...")
            print(f"{'='*70}")
            
            assembled_path = await self.ffmpeg.assemble_clips(
                clip_urls=clip_urls,
                music_url=None,
                output_filename=f"{job_id}_assembled.mp4"
            )
            
            await self._update_stage(job_id, "music_selection", "in_progress")
            
            tone = script.get("tone", "inspiring")
            music_url = await select_music_for_job(
                supabase_client=self.supabase,
                prompt=prompt,
                tone=tone,
                supabase_url=self.settings.SUPABASE_URL
            )
            
            if music_url:
                try:
                    print(f"\n[Orchestrator] Adding music overlay...")
                    final_path = await self.ffmpeg.assemble_clips(
                        clip_urls=clip_urls,
                        music_url=music_url,
                        output_filename=f"{job_id}_final.mp4"
                    )
                except Exception as e:
                    print(f"[Orchestrator] ⚠️  Music overlay failed: {str(e)}")
                    print(f"[Orchestrator] Continuing with video without music")
                    final_path = assembled_path
            else:
                final_path = assembled_path
            
            await self._update_stage(job_id, "upload", "in_progress")
            
            final_url = await self._upload_to_storage(
                file_path=final_path,
                job_id=job_id,
                user_id=user_id
            )
            
            await self.supabase.update_job_state(
                job_id=job_id,
                app_state={
                    "prompt": prompt,
                    "script": script,
                    "clips": clip_metadata,
                    "music_url": music_url,
                    "seed": seed,
                    "total_clips": len(clip_urls),
                    "total_duration": 60,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                },
                status="done",
                current_stage="completed",
                video_url=final_url,
                final_url=final_url
            )
            
            assembly_dir = Path(final_path).parent
            self.ffmpeg.cleanup(assembly_dir)
            
            print(f"\n{'='*70}")
            print(f"✅ Workflow completed successfully!")
            print(f"Final video: {final_url}")
            print(f"Duration: 60 seconds")
            print(f"Clips: {len(clip_urls)}")
            print(f"Base seed: {seed}")
            print(f"{'='*70}\n")
            
            return {
                "status": "success",
                "job_id": job_id,
                "video_url": final_url,
                "music_url": music_url,
                "seed": seed,
                "clips": len(clip_urls)
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
    
    async def _upload_to_storage(
        self,
        file_path: str,
        job_id: str,
        user_id: str
    ) -> str:
        """Upload final video to Supabase Storage and return public URL"""
        print(f"[Orchestrator] Uploading to Supabase Storage...")
        
        with open(file_path, 'rb') as f:
            file_content = f.read()
        
        storage_path = f"{user_id}/{job_id}_final.mp4"
        
        result = self.supabase.client.storage.from_('videos').upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": "video/mp4"}
        )
        
        public_url = self.supabase.client.storage.from_('videos').get_public_url(storage_path)
        
        print(f"[Orchestrator] ✓ Uploaded to: {public_url}")
        
        return public_url


async def create_and_run_job(
    user_id: str,
    prompt: str,
    seed: int = None
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
    result = await orchestrator.run(job_id, user_id, prompt, seed)
    
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
            print(f"Seed: {result['seed']}")
            print(f"Clips: {result['clips']}")
        else:
            print(f"Erreur: {result['error']}")
    
    asyncio.run(main())
