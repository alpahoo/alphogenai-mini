"""
LangGraph Orchestrator for AlphoGenAI Mini
Manages the pipeline: Qwen → WAN Image → Pika → ElevenLabs → Remotion
"""
import asyncio
from typing import Dict, Any, TypedDict, Annotated, Sequence
from datetime import datetime
import httpx

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage

from .config import get_settings
from .supabase_client import SupabaseClient
from .api_services import (
    QwenService,
    WANImageService,
    PikaService,
    ElevenLabsService,
    RemotionService,
)


class WorkflowState(TypedDict):
    """State passed between workflow nodes"""
    job_id: str
    user_id: str
    prompt: str
    script: Dict[str, Any]
    key_visual: Dict[str, Any]
    clips: list[Dict[str, Any]]
    audio: Dict[str, Any]
    final_video: Dict[str, Any]
    error: str | None
    retry_count: int
    messages: Annotated[Sequence[BaseMessage], "messages"]


class VideoGenerationOrchestrator:
    """LangGraph-based orchestrator for video generation pipeline"""
    
    def __init__(self):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        
        # Initialize API services
        self.qwen = QwenService()
        self.wan_image = WANImageService()
        self.pika = PikaService()
        self.elevenlabs = ElevenLabsService()
        self.remotion = RemotionService()
        
        # Build the workflow graph
        self.workflow = self._build_workflow()
    
    def _build_workflow(self) -> StateGraph:
        """Build the LangGraph workflow"""
        workflow = StateGraph(WorkflowState)
        
        # Add nodes for each stage
        workflow.add_node("generate_script", self._generate_script_node)
        workflow.add_node("generate_key_visual", self._generate_key_visual_node)
        workflow.add_node("generate_clips", self._generate_clips_node)
        workflow.add_node("generate_audio", self._generate_audio_node)
        workflow.add_node("assemble_video", self._assemble_video_node)
        workflow.add_node("handle_error", self._handle_error_node)
        workflow.add_node("notify_completion", self._notify_completion_node)
        
        # Define the flow
        workflow.set_entry_point("generate_script")
        
        workflow.add_edge("generate_script", "generate_key_visual")
        workflow.add_edge("generate_key_visual", "generate_clips")
        workflow.add_edge("generate_clips", "generate_audio")
        workflow.add_edge("generate_audio", "assemble_video")
        workflow.add_edge("assemble_video", "notify_completion")
        workflow.add_edge("notify_completion", END)
        
        # Error handling edges (would add conditional edges for retry logic)
        workflow.add_edge("handle_error", END)
        
        return workflow.compile()
    
    async def _generate_script_node(self, state: WorkflowState) -> WorkflowState:
        """Node 1: Generate script using Qwen"""
        try:
            await self.supabase.update_job_status(
                state["job_id"],
                "in_progress",
                stage="generate_script"
            )
            
            # Check cache first
            cached = await self.supabase.check_cache(
                state["prompt"],
                state["user_id"]
            )
            
            if cached and cached.get("result", {}).get("script"):
                print(f"[Qwen] Using cached script for job {state['job_id']}")
                state["script"] = cached["result"]["script"]
                return state
            
            # Generate new script
            print(f"[Qwen] Generating script for job {state['job_id']}")
            script_result = await self.qwen.generate_script(state["prompt"])
            
            state["script"] = script_result
            
            # Save artifact
            await self.supabase.save_stage_artifact(
                state["job_id"],
                "script",
                script_result
            )
            
            print(f"[Qwen] Script generated: {len(script_result['scenes'])} scenes")
            return state
            
        except Exception as e:
            print(f"[Qwen] Error: {str(e)}")
            state["error"] = f"Script generation failed: {str(e)}"
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
            raise
    
    async def _generate_key_visual_node(self, state: WorkflowState) -> WorkflowState:
        """Node 2: Generate key visual using WAN Image"""
        try:
            await self.supabase.update_job_status(
                state["job_id"],
                "in_progress",
                stage="generate_key_visual"
            )
            
            # Use first scene description for key visual
            first_scene = state["script"]["scenes"][0]["description"]
            
            print(f"[WAN Image] Generating key visual for job {state['job_id']}")
            visual_result = await self.wan_image.generate_image(
                first_scene,
                style="cinematic"
            )
            
            state["key_visual"] = visual_result
            
            # Save artifact
            await self.supabase.save_stage_artifact(
                state["job_id"],
                "key_visual",
                visual_result
            )
            
            print(f"[WAN Image] Key visual generated: {visual_result['image_url']}")
            return state
            
        except Exception as e:
            print(f"[WAN Image] Error: {str(e)}")
            state["error"] = f"Key visual generation failed: {str(e)}"
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
            raise
    
    async def _generate_clips_node(self, state: WorkflowState) -> WorkflowState:
        """Node 3: Generate 4 video clips using Pika"""
        try:
            await self.supabase.update_job_status(
                state["job_id"],
                "in_progress",
                stage="generate_clips"
            )
            
            scenes = state["script"]["scenes"][:4]  # Limit to 4 clips
            clips = []
            
            print(f"[Pika] Generating {len(scenes)} clips for job {state['job_id']}")
            
            # Generate clips in parallel
            tasks = []
            for i, scene in enumerate(scenes):
                # First clip uses key visual as starting frame
                image_url = state["key_visual"]["image_url"] if i == 0 else None
                
                tasks.append(
                    self.pika.generate_clip(
                        prompt=scene["description"],
                        image_url=image_url,
                        duration=5
                    )
                )
            
            clip_results = await asyncio.gather(*tasks)
            
            for i, clip_result in enumerate(clip_results):
                clips.append({
                    "index": i,
                    "scene": scenes[i],
                    **clip_result
                })
            
            state["clips"] = clips
            
            # Save artifacts
            await self.supabase.save_stage_artifact(
                state["job_id"],
                "clips",
                {"clips": clips}
            )
            
            print(f"[Pika] Generated {len(clips)} clips")
            return state
            
        except Exception as e:
            print(f"[Pika] Error: {str(e)}")
            state["error"] = f"Clip generation failed: {str(e)}"
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
            raise
    
    async def _generate_audio_node(self, state: WorkflowState) -> WorkflowState:
        """Node 4: Generate voiceover and SRT using ElevenLabs"""
        try:
            await self.supabase.update_job_status(
                state["job_id"],
                "in_progress",
                stage="generate_audio"
            )
            
            # Combine all scene narrations
            full_narration = " ".join([
                scene["narration"].strip()
                for scene in state["script"]["scenes"]
            ])
            
            print(f"[ElevenLabs] Generating audio for job {state['job_id']}")
            audio_result = await self.elevenlabs.generate_speech(full_narration)
            
            # TODO: Upload audio to Supabase Storage and get public URL
            # For now, store locally or in temp location
            
            state["audio"] = audio_result
            
            # Save artifact
            await self.supabase.save_stage_artifact(
                state["job_id"],
                "audio",
                {
                    "srt_content": audio_result["srt_content"],
                    "duration": audio_result["duration"],
                }
            )
            
            print(f"[ElevenLabs] Audio generated: {audio_result['duration']}s")
            return state
            
        except Exception as e:
            print(f"[ElevenLabs] Error: {str(e)}")
            state["error"] = f"Audio generation failed: {str(e)}"
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
            raise
    
    async def _assemble_video_node(self, state: WorkflowState) -> WorkflowState:
        """Node 5: Assemble final video using Remotion"""
        try:
            await self.supabase.update_job_status(
                state["job_id"],
                "in_progress",
                stage="assemble_video"
            )
            
            print(f"[Remotion] Assembling final video for job {state['job_id']}")
            
            # Prepare clips data for Remotion
            clips_data = [
                {
                    "url": clip["video_url"],
                    "duration": clip["duration"],
                    "index": clip["index"],
                }
                for clip in state["clips"]
            ]
            
            # TODO: Get actual audio URL from storage
            audio_url = state["audio"].get("audio_url", "")
            
            video_result = await self.remotion.render_video(
                clips=clips_data,
                audio_url=audio_url,
                srt_content=state["audio"]["srt_content"],
                metadata={
                    "prompt": state["prompt"],
                    "created_at": datetime.utcnow().isoformat(),
                }
            )
            
            state["final_video"] = video_result
            
            # Update job with final result
            await self.supabase.update_job_status(
                state["job_id"],
                "completed",
                stage="completed",
                result_data={
                    "video_url": video_result["video_url"],
                    "render_id": video_result["render_id"],
                    "script": state["script"],
                }
            )
            
            print(f"[Remotion] Final video ready: {video_result['video_url']}")
            return state
            
        except Exception as e:
            print(f"[Remotion] Error: {str(e)}")
            state["error"] = f"Video assembly failed: {str(e)}"
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
            raise
    
    async def _handle_error_node(self, state: WorkflowState) -> WorkflowState:
        """Handle errors and implement retry logic"""
        max_retries = self.settings.MAX_RETRIES
        
        if state["retry_count"] < max_retries:
            state["retry_count"] += 1
            print(f"[Retry] Attempt {state['retry_count']}/{max_retries}")
            await asyncio.sleep(self.settings.RETRY_DELAY)
            # Could implement restart from last successful stage
        else:
            print(f"[Error] Max retries reached for job {state['job_id']}")
            await self.supabase.update_job_status(
                state["job_id"],
                "failed",
                error_message=state["error"]
            )
        
        return state
    
    async def _notify_completion_node(self, state: WorkflowState) -> WorkflowState:
        """Send webhook notification when video is ready"""
        try:
            webhook_url = self.settings.WEBHOOK_URL
            
            if not webhook_url:
                print("[Webhook] No webhook URL configured, skipping notification")
                return state
            
            print(f"[Webhook] Sending completion notification for job {state['job_id']}")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                payload = {
                    "job_id": state["job_id"],
                    "user_id": state["user_id"],
                    "status": "completed",
                    "video_url": state["final_video"]["video_url"],
                    "timestamp": datetime.utcnow().isoformat(),
                }
                
                headers = {"Content-Type": "application/json"}
                
                if self.settings.WEBHOOK_SECRET:
                    headers["X-Webhook-Secret"] = self.settings.WEBHOOK_SECRET
                
                response = await client.post(
                    webhook_url,
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()
                
                print(f"[Webhook] Notification sent successfully")
            
            return state
            
        except Exception as e:
            print(f"[Webhook] Failed to send notification: {str(e)}")
            # Don't fail the job if webhook fails
            return state
    
    async def run(
        self,
        job_id: str,
        user_id: str,
        prompt: str
    ) -> Dict[str, Any]:
        """Execute the complete video generation workflow"""
        
        initial_state: WorkflowState = {
            "job_id": job_id,
            "user_id": user_id,
            "prompt": prompt,
            "script": {},
            "key_visual": {},
            "clips": [],
            "audio": {},
            "final_video": {},
            "error": None,
            "retry_count": 0,
            "messages": [],
        }
        
        print(f"\n{'='*60}")
        print(f"Starting video generation workflow for job {job_id}")
        print(f"Prompt: {prompt}")
        print(f"{'='*60}\n")
        
        try:
            # Run the workflow
            final_state = await self.workflow.ainvoke(initial_state)
            
            print(f"\n{'='*60}")
            print(f"Workflow completed for job {job_id}")
            print(f"Video URL: {final_state.get('final_video', {}).get('video_url', 'N/A')}")
            print(f"{'='*60}\n")
            
            return {
                "status": "success",
                "job_id": job_id,
                "video_url": final_state.get("final_video", {}).get("video_url"),
                "result": final_state,
            }
            
        except Exception as e:
            print(f"\n{'='*60}")
            print(f"Workflow failed for job {job_id}")
            print(f"Error: {str(e)}")
            print(f"{'='*60}\n")
            
            return {
                "status": "failed",
                "job_id": job_id,
                "error": str(e),
            }


async def create_and_run_job(
    user_id: str,
    prompt: str
) -> Dict[str, Any]:
    """
    High-level function to create and run a video generation job
    
    Usage:
        result = await create_and_run_job(
            user_id="user_123",
            prompt="Create a video about AI innovations in 2024"
        )
    """
    supabase = SupabaseClient()
    
    # Create job in database
    job_id = await supabase.create_job(
        user_id=user_id,
        prompt=prompt,
        metadata={"created_at": datetime.utcnow().isoformat()}
    )
    
    # Initialize and run orchestrator
    orchestrator = VideoGenerationOrchestrator()
    result = await orchestrator.run(job_id, user_id, prompt)
    
    return result


# CLI entry point for testing
if __name__ == "__main__":
    import sys
    
    async def main():
        if len(sys.argv) < 2:
            print("Usage: python langgraph_orchestrator.py <prompt>")
            sys.exit(1)
        
        prompt = " ".join(sys.argv[1:])
        result = await create_and_run_job(
            user_id="test_user",
            prompt=prompt
        )
        
        print("\n=== Final Result ===")
        print(result)
    
    asyncio.run(main())
