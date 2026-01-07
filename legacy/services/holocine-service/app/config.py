from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class Config:
    # Runpod
    runpod_api_key: Optional[str]

    # Supabase
    supabase_url: Optional[str]
    supabase_service_role_key: Optional[str]

    # Cloudflare R2 (S3-compatible)
    r2_account_id: Optional[str]
    r2_access_key_id: Optional[str]
    r2_secret_access_key: Optional[str]
    r2_endpoint_url: Optional[str]
    r2_bucket_models: Optional[str]
    r2_bucket_outputs: Optional[str]
    r2_public_base_url: Optional[str]

    # Checkpoints and outputs
    checkpoints_path: str
    outputs_path: str

    # Hugging Face
    huggingface_token: Optional[str]

    # Service behavior
    license_mode: str
    auto_download: bool
    public_base_url: Optional[str]
    default_mode: str
    default_num_frames: int
    inference_timeout_s: int
    allow_fake_output: bool

    # Server mode
    server_mode: str  # "http" or "runpod"

    # Debug
    debug: bool


TRUE_SET = {"1", "true", "yes", "on"}


def _get_bool(name: str, default: bool = False) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in TRUE_SET


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def load_config() -> Config:
    return Config(
        runpod_api_key=os.getenv("RUNPOD_API_KEY"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        r2_account_id=os.getenv("R2_ACCOUNT_ID"),
        r2_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        r2_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        r2_endpoint_url=os.getenv("R2_ENDPOINT_URL"),
        r2_bucket_models=os.getenv("R2_BUCKET_MODELS"),
        r2_bucket_outputs=os.getenv("R2_BUCKET_OUTPUTS"),
        r2_public_base_url=os.getenv("R2_PUBLIC_BASE_URL"),
        checkpoints_path=os.getenv("CHECKPOINTS_PATH", "/checkpoints"),
        outputs_path=os.getenv("OUTPUTS_PATH", "/outputs"),
        huggingface_token=os.getenv("HUGGINGFACE_TOKEN"),
        license_mode=os.getenv("LICENSE_MODE", "research"),
        auto_download=_get_bool("AUTO_DOWNLOAD", False),
        public_base_url=os.getenv("PUBLIC_BASE_URL"),
        default_mode=os.getenv("DEFAULT_MODE", "sparse"),
        default_num_frames=_get_int("DEFAULT_NUM_FRAMES", 121),
        inference_timeout_s=_get_int("INFERENCE_TIMEOUT_S", 720),
        allow_fake_output=_get_bool("ALLOW_FAKE_OUTPUT", False),
        server_mode=os.getenv("SERVER_MODE", "http"),
        debug=_get_bool("DEBUG", False),
    )
