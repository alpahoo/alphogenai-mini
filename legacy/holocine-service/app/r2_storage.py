from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import boto3
from botocore.client import Config as BotoConfig

from .config import Config
from .logging_setup import get_logger


logger = get_logger("r2")


@dataclass
class R2Settings:
    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    public_base_url: Optional[str]


class R2Client:
    def __init__(self, cfg: Config) -> None:
        if not (cfg.r2_endpoint_url and cfg.r2_access_key_id and cfg.r2_secret_access_key):
            raise ValueError("R2 configuration is incomplete: endpoint/access/secret required")
        self.s3 = boto3.client(
            "s3",
            endpoint_url=cfg.r2_endpoint_url,
            aws_access_key_id=cfg.r2_access_key_id,
            aws_secret_access_key=cfg.r2_secret_access_key,
            config=BotoConfig(signature_version="s3v4"),
        )
        self.public_base_url = cfg.r2_public_base_url

    def upload_file(self, bucket: str, local_path: str, key: str) -> str:
        logger.info(
            "Uploading to R2",
            extra={"bucket": bucket, "key": key, "size_bytes": os.path.getsize(local_path)},
        )
        self.s3.upload_file(local_path, bucket, key)
        return key

    def download_to_path(self, bucket: str, key: str, local_path: str) -> None:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        self.s3.download_file(bucket, key, local_path)

    def compose_public_url(self, bucket: str, key: str) -> Optional[str]:
        if self.public_base_url:
            base = self.public_base_url.rstrip("/")
            return f"{base}/{key}"
        # If no public base url, cannot guarantee GET access; return None
        return None

    def list_prefix(self, bucket: str, prefix: str):
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for item in page.get("Contents", []) or []:
                yield item["Key"]
