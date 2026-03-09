"""
FFmpeg-based video assembly and music overlay service
"""
import os
import asyncio
import tempfile
import subprocess
from typing import List, Dict, Any, Optional
import httpx
from pathlib import Path


class FFmpegAssembler:
    """Service to assemble multiple video clips with music overlay"""
    
    def __init__(self):
        self.temp_dir = Path(tempfile.mkdtemp(prefix="video_assembly_"))
    
    async def assemble_clips(
        self,
        clip_urls: List[str],
        music_url: Optional[str] = None,
        output_filename: str = "final_video.mp4"
    ) -> str:
        """
        Download clips, concatenate them, add music, and return path to final video
        
        Args:
            clip_urls: List of video clip URLs to concatenate
            music_url: Optional music track URL to overlay
            output_filename: Name for the output file
            
        Returns:
            Path to the final assembled video file
        """
        print(f"\n{'='*70}")
        print(f"🎬 FFmpeg Assembler - Starting assembly")
        print(f"{'='*70}")
        print(f"Clips to assemble: {len(clip_urls)}")
        if music_url:
            print(f"Music track: {music_url[:60]}...")
        print(f"{'='*70}\n")
        
        assembly_dir = None
        try:
            assembly_id = os.urandom(8).hex()
            assembly_dir = self.temp_dir / assembly_id
            assembly_dir.mkdir(exist_ok=True)

            clip_paths = await self._download_clips(clip_urls, assembly_dir)

            concat_path = await self._concatenate_clips(clip_paths, assembly_dir)

            if music_url:
                print(f"\n[FFmpeg] Adding music overlay...")
                final_path = await self._add_music(
                    concat_path,
                    music_url,
                    assembly_dir,
                    output_filename
                )
            else:
                final_path = concat_path
                final_output = assembly_dir / output_filename
                os.rename(concat_path, final_output)
                final_path = final_output

            print(f"\n{'='*70}")
            print(f"Assembly completed successfully!")
            print(f"Final video: {final_path}")
            print(f"File size: {os.path.getsize(final_path) / 1024 / 1024:.2f} MB")
            print(f"{'='*70}\n")

            return str(final_path)

        except Exception as e:
            print(f"\n{'='*70}")
            print(f"Assembly failed: {str(e)}")
            print(f"{'='*70}\n")
            if assembly_dir:
                self.cleanup(assembly_dir)
            raise
    
    async def _download_clips(
        self,
        clip_urls: List[str],
        assembly_dir: Path
    ) -> List[Path]:
        """Download all video clips to temp directory"""
        print(f"[FFmpeg] Downloading {len(clip_urls)} clips...")
        
        clip_paths = []
        async with httpx.AsyncClient(timeout=300.0) as client:
            for i, url in enumerate(clip_urls):
                print(f"[FFmpeg] Downloading clip {i+1}/{len(clip_urls)}...")
                response = await client.get(url)
                response.raise_for_status()
                
                clip_path = assembly_dir / f"clip_{i:02d}.mp4"
                with open(clip_path, 'wb') as f:
                    f.write(response.content)
                
                clip_paths.append(clip_path)
                print(f"[FFmpeg] ✓ Clip {i+1} downloaded ({len(response.content) / 1024 / 1024:.2f} MB)")
        
        return clip_paths
    
    async def _concatenate_clips(
        self,
        clip_paths: List[Path],
        assembly_dir: Path
    ) -> Path:
        """Concatenate video clips using FFmpeg"""
        print(f"[FFmpeg] Concatenating {len(clip_paths)} clips...")
        
        concat_file = assembly_dir / "concat_list.txt"
        with open(concat_file, 'w') as f:
            for clip_path in clip_paths:
                f.write(f"file '{clip_path.absolute()}'\n")
        
        output_path = assembly_dir / "concatenated.mp4"
        
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', str(concat_file),
            '-c', 'copy',
            '-y',
            str(output_path)
        ]
        
        print(f"[FFmpeg] Running: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"FFmpeg concat failed: {error_msg}")
        
        print(f"[FFmpeg] ✓ Clips concatenated ({os.path.getsize(output_path) / 1024 / 1024:.2f} MB)")
        
        return output_path
    
    async def _add_music(
        self,
        video_path: Path,
        music_url: str,
        assembly_dir: Path,
        output_filename: str
    ) -> Path:
        """Add music overlay to video"""
        print(f"[FFmpeg] Adding music overlay...")
        
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.get(music_url)
            response.raise_for_status()
            
            music_path = assembly_dir / "music.mp3"
            with open(music_path, 'wb') as f:
                f.write(response.content)
            
            print(f"[FFmpeg] ✓ Music downloaded ({len(response.content) / 1024 / 1024:.2f} MB)")
        
        has_audio = await self._video_has_audio(video_path)
        print(f"[FFmpeg] Video has audio stream: {has_audio}")
        
        output_path = assembly_dir / output_filename
        
        if has_audio:
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-i', str(music_path),
                '-filter_complex',
                '[1:a]volume=0.3[music];[0:a][music]amix=inputs=2:duration=shortest[a]',
                '-map', '0:v',
                '-map', '[a]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-y',
                str(output_path)
            ]
        else:
            cmd = [
                'ffmpeg',
                '-i', str(video_path),
                '-i', str(music_path),
                '-filter_complex',
                '[1:a]volume=0.3[a]',
                '-map', '0:v',
                '-map', '[a]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-y',
                str(output_path)
            ]
        
        print(f"[FFmpeg] Running: {' '.join(cmd)}")
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"FFmpeg music overlay failed: {error_msg}")
        
        print(f"[FFmpeg] ✓ Music added ({os.path.getsize(output_path) / 1024 / 1024:.2f} MB)")
        
        return output_path
    
    async def _video_has_audio(self, video_path: Path) -> bool:
        """Check if video has an audio stream using ffprobe"""
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'a',
            '-show_entries', 'stream=codec_type',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await process.communicate()
        
        return bool(stdout.strip())
    
    def cleanup(self, assembly_dir: Path):
        """Clean up temporary files"""
        try:
            import shutil
            shutil.rmtree(assembly_dir)
            print(f"[FFmpeg] ✓ Cleaned up temp directory")
        except Exception as e:
            print(f"[FFmpeg] Warning: Failed to cleanup {assembly_dir}: {e}")
