"""
Video assembly service using ffmpeg to combine scenes with music
"""
import os
import asyncio
import tempfile
import subprocess
from typing import List, Dict, Any, Optional
import httpx
from pathlib import Path


class VideoAssemblyService:
    """Service to assemble multiple video scenes with background music using ffmpeg"""
    
    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir()) / "video_assembly"
        self.temp_dir.mkdir(exist_ok=True)
    
    async def assemble_project_video(
        self,
        scenes: List[Dict[str, Any]],
        project_id: str,
        output_format: str = "webm"
    ) -> Dict[str, Any]:
        """
        Assemble multiple video scenes into a single video with music
        
        Args:
            scenes: List of scene objects with output_url, music_url, duration
            project_id: Project ID for naming
            output_format: Output format (webm, mp4)
            
        Returns:
            Dict with final_video_path, thumbnail_path, duration
        """
        print(f"[VideoAssembly] Starting assembly for project {project_id}")
        print(f"[VideoAssembly] Scenes to process: {len(scenes)}")
        
        try:
            # Download all scene videos
            scene_files = []
            total_duration = 0
            
            for i, scene in enumerate(scenes):
                if not scene.get("output_url"):
                    continue
                    
                scene_file = await self._download_video(
                    scene["output_url"], 
                    f"scene_{scene['scene_number']:02d}_{project_id}.mp4"
                )
                scene_files.append(scene_file)
                total_duration += scene.get("duration", 8)
                print(f"[VideoAssembly] Downloaded scene {scene['scene_number']}: {scene_file}")
            
            if not scene_files:
                raise ValueError("No valid scene videos found")
            
            # Select music (use first scene's music or default)
            music_file = None
            music_url = scenes[0].get("music_url") if scenes else None
            if music_url:
                music_file = await self._download_audio(music_url, f"music_{project_id}.mp3")
                print(f"[VideoAssembly] Downloaded music: {music_file}")
            
            # Concatenate videos
            concat_video = await self._concatenate_videos(scene_files, project_id)
            print(f"[VideoAssembly] Concatenated video: {concat_video}")
            
            # Add music if available
            final_video = concat_video
            if music_file:
                final_video = await self._add_background_music(
                    concat_video, 
                    music_file, 
                    project_id,
                    total_duration,
                    output_format
                )
                print(f"[VideoAssembly] Added music: {final_video}")
            
            # Generate thumbnail
            thumbnail_file = await self._generate_thumbnail(final_video, project_id)
            print(f"[VideoAssembly] Generated thumbnail: {thumbnail_file}")
            
            # TODO: Upload to Supabase Storage
            # For now, return local paths (in production, upload to cloud storage)
            
            result = {
                "final_video_path": str(final_video),
                "thumbnail_path": str(thumbnail_file),
                "duration": total_duration,
                "format": output_format,
                "scenes_count": len(scene_files)
            }
            
            print(f"[VideoAssembly] ✓ Assembly completed successfully")
            print(f"[VideoAssembly] Final video: {result['final_video_path']}")
            
            return result
            
        except Exception as e:
            print(f"[VideoAssembly] ❌ Assembly failed: {str(e)}")
            raise
        finally:
            # Cleanup temporary files
            await self._cleanup_temp_files(project_id)
    
    async def _download_video(self, url: str, filename: str) -> Path:
        """Download video from URL to temp directory"""
        file_path = self.temp_dir / filename
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            with open(file_path, "wb") as f:
                f.write(response.content)
        
        return file_path
    
    async def _download_audio(self, url: str, filename: str) -> Path:
        """Download audio from URL to temp directory"""
        file_path = self.temp_dir / filename
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            with open(file_path, "wb") as f:
                f.write(response.content)
        
        return file_path
    
    async def _concatenate_videos(self, video_files: List[Path], project_id: str) -> Path:
        """Concatenate multiple video files using ffmpeg"""
        output_file = self.temp_dir / f"concat_{project_id}.mp4"
        
        # Create concat file list
        concat_file = self.temp_dir / f"concat_list_{project_id}.txt"
        with open(concat_file, "w") as f:
            for video_file in video_files:
                f.write(f"file '{video_file.absolute()}'\n")
        
        # Run ffmpeg concat
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            str(output_file)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"ffmpeg concat failed: {stderr.decode()}")
        
        return output_file
    
    async def _add_background_music(
        self, 
        video_file: Path, 
        music_file: Path, 
        project_id: str,
        duration: int,
        output_format: str = "webm"
    ) -> Path:
        """Add background music to video using ffmpeg"""
        ext = "webm" if output_format == "webm" else "mp4"
        output_file = self.temp_dir / f"final_{project_id}.{ext}"
        
        # ffmpeg command to mix video with background music
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_file),
            "-i", str(music_file),
            "-filter_complex", 
            f"[1:a]aloop=loop=-1:size=2e+09[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[audio]",
            "-map", "0:v",
            "-map", "[audio]",
            "-c:v", "libvpx-vp9" if output_format == "webm" else "libx264",
            "-c:a", "libopus" if output_format == "webm" else "aac",
            "-t", str(duration),
            str(output_file)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"ffmpeg music overlay failed: {stderr.decode()}")
        
        return output_file
    
    async def _generate_thumbnail(self, video_file: Path, project_id: str) -> Path:
        """Generate thumbnail from video using ffmpeg"""
        thumbnail_file = self.temp_dir / f"thumb_{project_id}.jpg"
        
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_file),
            "-ss", "2",  # Extract frame at 2 seconds
            "-vframes", "1",
            "-q:v", "2",  # High quality
            str(thumbnail_file)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"ffmpeg thumbnail generation failed: {stderr.decode()}")
        
        return thumbnail_file
    
    async def _cleanup_temp_files(self, project_id: str):
        """Clean up temporary files for a project"""
        try:
            for file_path in self.temp_dir.glob(f"*{project_id}*"):
                if file_path.is_file():
                    file_path.unlink()
                    print(f"[VideoAssembly] Cleaned up: {file_path}")
        except Exception as e:
            print(f"[VideoAssembly] Cleanup warning: {e}")


# Utility function to check if ffmpeg is available
async def check_ffmpeg_availability() -> bool:
    """Check if ffmpeg is installed and available"""
    try:
        process = await asyncio.create_subprocess_exec(
            "ffmpeg", "-version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return process.returncode == 0
    except FileNotFoundError:
        return False


if __name__ == "__main__":
    async def test_assembly():
        # Test ffmpeg availability
        if not await check_ffmpeg_availability():
            print("❌ ffmpeg not found. Please install ffmpeg first.")
            return
        
        print("✓ ffmpeg is available")
        
        # Test assembly service
        service = VideoAssemblyService()
        
        # Mock scenes data
        scenes = [
            {
                "scene_number": 1,
                "output_url": "https://example.com/scene1.mp4",
                "music_url": "https://example.com/music.mp3",
                "duration": 8
            }
        ]
        
        try:
            result = await service.assemble_project_video(scenes, "test_project")
            print(f"✓ Test completed: {result}")
        except Exception as e:
            print(f"❌ Test failed: {e}")
    
    asyncio.run(test_assembly())