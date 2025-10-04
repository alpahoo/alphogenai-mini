"""
Background worker that polls for pending jobs and processes them
"""
import asyncio
import signal
import sys
from datetime import datetime
from typing import Optional

from .supabase_client import SupabaseClient
from .langgraph_orchestrator import VideoGenerationOrchestrator
from .config import get_settings


class VideoWorker:
    """Background worker for processing video generation jobs"""
    
    def __init__(self, poll_interval: int = 10):
        self.settings = get_settings()
        self.supabase = SupabaseClient()
        self.orchestrator = VideoGenerationOrchestrator()
        self.poll_interval = poll_interval
        self.running = False
        self.current_job_id: Optional[str] = None
    
    async def start(self):
        """Start the worker and begin polling for jobs"""
        self.running = True
        
        print("="*60)
        print("AlphoGenAI Mini Video Worker")
        print("="*60)
        print(f"Started at: {datetime.now().isoformat()}")
        print(f"Poll interval: {self.poll_interval}s")
        print(f"Max retries: {self.settings.MAX_RETRIES}")
        print("="*60)
        print("\nWaiting for jobs...\n")
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
        
        while self.running:
            try:
                await self._process_pending_jobs()
                await asyncio.sleep(self.poll_interval)
                
            except KeyboardInterrupt:
                print("\n\nReceived interrupt signal...")
                break
            except Exception as e:
                print(f"[ERROR] Worker error: {str(e)}")
                await asyncio.sleep(self.poll_interval)
        
        print("\nWorker stopped.")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        print(f"\nReceived signal {signum}")
        self.running = False
        
        if self.current_job_id:
            print(f"Current job {self.current_job_id} will be marked as failed")
            # Mark current job as failed so it can be retried
            asyncio.create_task(
                self.supabase.update_job_status(
                    self.current_job_id,
                    "failed",
                    error_message="Worker shutdown during processing"
                )
            )
    
    async def _process_pending_jobs(self):
        """Poll for pending jobs and process them"""
        # Query for pending jobs
        result = self.supabase.client.table("video_cache") \
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
        print(f"Processing Job: {job['id']}")
        print(f"User: {job['user_id']}")
        print(f"Prompt: {job['prompt'][:100]}...")
        print(f"{'='*60}\n")
        
        try:
            # Mark as in progress
            await self.supabase.update_job_status(
                job["id"],
                "in_progress"
            )
            
            # Run the orchestrator
            result = await self.orchestrator.run(
                job_id=job["id"],
                user_id=job["user_id"],
                prompt=job["prompt"]
            )
            
            if result["status"] == "success":
                print(f"\n✅ Job {job['id']} completed successfully!")
                print(f"Video URL: {result.get('video_url', 'N/A')}\n")
            else:
                print(f"\n❌ Job {job['id']} failed: {result.get('error', 'Unknown error')}\n")
            
        except Exception as e:
            print(f"\n❌ Job {job['id']} failed with exception: {str(e)}\n")
            await self.supabase.update_job_status(
                job["id"],
                "failed",
                error_message=str(e)
            )
        
        finally:
            self.current_job_id = None
    
    def stop(self):
        """Stop the worker"""
        self.running = False


async def main():
    """Main entry point for the worker"""
    poll_interval = 10  # seconds
    
    if len(sys.argv) > 1:
        try:
            poll_interval = int(sys.argv[1])
        except ValueError:
            print(f"Invalid poll interval: {sys.argv[1]}")
            print("Usage: python -m workers.worker [poll_interval_seconds]")
            sys.exit(1)
    
    worker = VideoWorker(poll_interval=poll_interval)
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
