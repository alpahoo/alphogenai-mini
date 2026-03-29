"""
Cloudflare R2 upload utility for AlphoGenAI Mini workers.
Mirrors the upload logic from modal_app/video_pipeline.py for use in the worker.
"""
import logging
from pathlib import Path
from typing import Optional

import boto3
from botocore.config import Config

from .config import get_settings

logger = logging.getLogger(__name__)


def upload_file_to_r2(
    file_path: str,
    key: str,
    content_type: str = "video/mp4",
) -> Optional[str]:
    """
    Upload a local file to Cloudflare R2 and return the public URL.

    Args:
        file_path: Local path to the file to upload.
        key: Object key in the bucket (e.g. "videos/job_abc_final.mp4").
        content_type: MIME type for the uploaded object.

    Returns:
        Public URL of the uploaded object, or None if R2 is not configured.
    """
    settings = get_settings()

    if not settings.R2_ENDPOINT or not settings.R2_ACCESS_KEY_ID or not settings.R2_SECRET_ACCESS_KEY:
        logger.warning("R2 credentials not configured — skipping upload")
        return None

    path = Path(file_path)
    if not path.exists():
        logger.error(f"File not found: {file_path}")
        return None

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )

    file_size = path.stat().st_size
    logger.info(f"Uploading {file_path} to R2 ({file_size / 1024 / 1024:.2f} MB) → {key}")

    with open(file_path, "rb") as f:
        s3.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=key,
            Body=f,
            ContentType=content_type,
        )

    public_url = (settings.R2_PUBLIC_URL or "").rstrip("/")
    url = f"{public_url}/{key}"
    logger.info(f"Uploaded to R2: {url}")
    return url
