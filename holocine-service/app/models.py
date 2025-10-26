from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field, validator


Mode = Literal["sparse", "full"]


class GenerateRequest(BaseModel):
    global_caption: str = Field(..., description="Global prompt for the sequence")
    shot_captions: List[str] = Field(default_factory=list, description="Optional per-shot prompts")
    num_frames: int = Field(121, ge=1, le=1000)
    mode: Mode = Field("sparse")
    seed: Optional[int] = Field(default=None)

    @validator("shot_captions", pre=True, always=True)
    def default_shots(cls, v):
        return v or []


class GenerateResponse(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "error"]


class StatusResponse(BaseModel):
    status: Literal["queued", "running", "done", "error"]
    video_url: Optional[str] = None
    progress: Optional[float] = None
    error: Optional[str] = None


class HealthzResponse(BaseModel):
    status: Literal["ok", "degraded", "error"] = "ok"
    gpu: Optional[str] = None
    vram_gb: Optional[int] = None
    torch: Optional[str] = None
    cuda: Optional[str] = None
    flash_attn: Optional[str] = None
    license_mode: Optional[str] = None
    checkpoints_ready: bool = False
