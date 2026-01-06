#!/usr/bin/env python3
"""
Audio Mixing and Normalization Utilities

This module provides audio mixing capabilities using ffmpeg:
- Loudness normalization (LUFS)
- Audio mixing with video
- Format conversion
"""

import os
import logging
import asyncio
import tempfile
import subprocess
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class MixingError(Exception):
    """Exception raised when audio mixing fails."""
    pass


class AudioMixer:
    """
    Audio mixer using ffmpeg for normalization and mixing.
    """
    
    def __init__(self):
        """Initialize audio mixer."""
        self._check_ffmpeg()
    
    def _check_ffmpeg(self):
        """Check if ffmpeg is available."""
        try:
            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode != 0:
                raise MixingError("ffmpeg not found or not working")
            logger.info("ffmpeg is available")
        except FileNotFoundError:
            raise MixingError("ffmpeg not installed")
        except Exception as e:
            raise MixingError(f"ffmpeg check failed: {e}")
    
    async def normalize_audio(
        self,
        audio_path: str,
        target_lufs: float = -16.0,
        output_path: Optional[str] = None
    ) -> str:
        """
        Normalize audio to target LUFS using ffmpeg loudnorm filter.
        
        Args:
            audio_path: Path to input audio file
            target_lufs: Target loudness in LUFS (default: -16.0)
            output_path: Path for output file (optional)
            
        Returns:
            Path to normalized audio file
        """
        try:
            logger.info(f"Normalizing audio to {target_lufs} LUFS: {audio_path}")
            
            if not os.path.exists(audio_path):
                raise MixingError(f"Audio file not found: {audio_path}")
            
            if output_path is None:
                temp_dir = Path(tempfile.gettempdir()) / "audio-service"
                temp_dir.mkdir(exist_ok=True)
                output_path = str(temp_dir / f"normalized_{os.urandom(8).hex()}.wav")
            
            measure_cmd = [
                "ffmpeg",
                "-i", audio_path,
                "-af", f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11:print_format=json",
                "-f", "null",
                "-"
            ]
            
            logger.debug(f"Measuring loudness: {' '.join(measure_cmd)}")
            
            measure_result = await asyncio.create_subprocess_exec(
                *measure_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await measure_result.communicate()
            
            if measure_result.returncode != 0:
                logger.error(f"Loudness measurement failed: {stderr.decode()}")
                return await self._simple_normalize(audio_path, output_path)
            
            stderr_text = stderr.decode()
            
            normalize_cmd = [
                "ffmpeg",
                "-i", audio_path,
                "-af", f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11",
                "-ar", "48000",  # Resample to 48kHz
                "-ac", "2",      # Stereo
                "-y",            # Overwrite output
                output_path
            ]
            
            logger.debug(f"Normalizing: {' '.join(normalize_cmd)}")
            
            normalize_result = await asyncio.create_subprocess_exec(
                *normalize_cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await normalize_result.communicate()
            
            if normalize_result.returncode != 0:
                raise MixingError(f"Normalization failed: {stderr.decode()}")
            
            logger.info(f"Audio normalized successfully: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Audio normalization failed: {e}")
            raise MixingError(f"Normalization failed: {e}")
    
    async def _simple_normalize(self, audio_path: str, output_path: str) -> str:
        """Simple volume normalization fallback."""
        logger.info("Using simple volume normalization")
        
        cmd = [
            "ffmpeg",
            "-i", audio_path,
            "-af", "volume=0.8",  # Simple volume adjustment
            "-ar", "48000",
            "-ac", "2",
            "-y",
            output_path
        ]
        
        result = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await result.communicate()
        
        if result.returncode != 0:
            raise MixingError(f"Simple normalization failed: {stderr.decode()}")
        
        return output_path
    
    async def mix_audio_with_video(
        self,
        video_path: str,
        audio_path: str,
        output_path: Optional[str] = None,
        audio_volume: float = 1.0
    ) -> str:
        """
        Mix audio track with video.
        
        Args:
            video_path: Path to input video file
            audio_path: Path to audio file to mix
            output_path: Path for output file (optional)
            audio_volume: Volume multiplier for audio (0.0-1.0)
            
        Returns:
            Path to output video with mixed audio
        """
        try:
            logger.info(f"Mixing audio with video: {video_path} + {audio_path}")
            
            if not os.path.exists(video_path):
                raise MixingError(f"Video file not found: {video_path}")
            
            if not os.path.exists(audio_path):
                raise MixingError(f"Audio file not found: {audio_path}")
            
            if output_path is None:
                temp_dir = Path(tempfile.gettempdir()) / "audio-service"
                temp_dir.mkdir(exist_ok=True)
                output_path = str(temp_dir / f"mixed_{os.urandom(8).hex()}.mp4")
            
            cmd = [
                "ffmpeg",
                "-i", video_path,
                "-i", audio_path,
                "-filter_complex",
                f"[1:a]volume={audio_volume}[a1];[0:a][a1]amix=inputs=2:duration=first[aout]",
                "-map", "0:v",
                "-map", "[aout]",
                "-c:v", "copy",  # Copy video codec
                "-c:a", "aac",   # Encode audio as AAC
                "-b:a", "192k",  # Audio bitrate
                "-y",
                output_path
            ]
            
            logger.debug(f"Mixing command: {' '.join(cmd)}")
            
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                raise MixingError(f"Audio mixing failed: {stderr.decode()}")
            
            logger.info(f"Audio mixed successfully: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Audio mixing failed: {e}")
            raise MixingError(f"Mixing failed: {e}")
    
    async def replace_audio_in_video(
        self,
        video_path: str,
        audio_path: str,
        output_path: Optional[str] = None
    ) -> str:
        """
        Replace video's audio track entirely.
        
        Args:
            video_path: Path to input video file
            audio_path: Path to new audio file
            output_path: Path for output file (optional)
            
        Returns:
            Path to output video with replaced audio
        """
        try:
            logger.info(f"Replacing audio in video: {video_path}")
            
            if not os.path.exists(video_path):
                raise MixingError(f"Video file not found: {video_path}")
            
            if not os.path.exists(audio_path):
                raise MixingError(f"Audio file not found: {audio_path}")
            
            if output_path is None:
                temp_dir = Path(tempfile.gettempdir()) / "audio-service"
                temp_dir.mkdir(exist_ok=True)
                output_path = str(temp_dir / f"replaced_{os.urandom(8).hex()}.mp4")
            
            cmd = [
                "ffmpeg",
                "-i", video_path,
                "-i", audio_path,
                "-map", "0:v",   # Video from first input
                "-map", "1:a",   # Audio from second input
                "-c:v", "copy",  # Copy video codec
                "-c:a", "aac",   # Encode audio as AAC
                "-b:a", "192k",
                "-shortest",     # Match shortest stream duration
                "-y",
                output_path
            ]
            
            logger.debug(f"Replace command: {' '.join(cmd)}")
            
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                raise MixingError(f"Audio replacement failed: {stderr.decode()}")
            
            logger.info(f"Audio replaced successfully: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Audio replacement failed: {e}")
            raise MixingError(f"Replacement failed: {e}")
    
    async def get_audio_info(self, audio_path: str) -> Dict[str, Any]:
        """
        Get audio file information using ffprobe.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Dictionary with audio information
        """
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                audio_path
            ]
            
            result = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await result.communicate()
            
            if result.returncode != 0:
                raise MixingError(f"ffprobe failed: {stderr.decode()}")
            
            import json
            info = json.loads(stdout.decode())
            
            audio_stream = next(
                (s for s in info.get("streams", []) if s.get("codec_type") == "audio"),
                {}
            )
            
            return {
                "duration": float(info.get("format", {}).get("duration", 0)),
                "sample_rate": int(audio_stream.get("sample_rate", 0)),
                "channels": int(audio_stream.get("channels", 0)),
                "codec": audio_stream.get("codec_name", "unknown"),
                "bitrate": int(info.get("format", {}).get("bit_rate", 0))
            }
            
        except Exception as e:
            logger.error(f"Failed to get audio info: {e}")
            return {}
