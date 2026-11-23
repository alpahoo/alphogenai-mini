"""Audio correction ported from h3-lab; raw input is never overwritten."""
import subprocess
from pathlib import Path


def probe(path: Path) -> dict:
    import av
    with av.open(str(path)) as container:
        return {"format": {"duration": float(container.duration) / av.time_base},
                "streams": [{"codec_type": stream.type, "codec_name": stream.codec_context.name}
                            for stream in container.streams]}


def shift_audio(source: Path, output: Path, seconds: float) -> None:
    if source.resolve() == output.resolve() or not 0 <= seconds <= 0.6:
        raise ValueError("INVALID_AUDIO_SHIFT")
    info = probe(source)
    kinds = {stream["codec_type"] for stream in info["streams"]}
    if not {"video", "audio"}.issubset(kinds):
        raise ValueError("MISSING_AUDIO_OR_VIDEO")
    duration = float(info["format"]["duration"])
    if not 1 <= duration <= 12:
        raise ValueError("INVALID_DURATION")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-ss", str(seconds), "-i", str(source),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", "apad", "-c:a", "aac",
                    "-b:a", "192k", "-t", f"{duration:.3f}", "-map_metadata", "-1", str(output)],
                   check=True, timeout=30, capture_output=True)
