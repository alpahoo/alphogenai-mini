"""
AES-256-GCM decryption for engine secrets (Python side).

Mirrors lib/encryption.ts — uses same algorithm and encoding format.
Only decryption is needed server-side (Python pipeline reads secrets).

Key: ENGINE_SECRETS_KEY env var (64 hex chars = 32 bytes)
Format: base64(ciphertext) + base64(iv) + base64(auth_tag)
"""
from __future__ import annotations

import base64
import os
from typing import Optional


def get_encryption_key() -> bytes:
    """Load encryption key from env. Raises if missing/invalid."""
    hex_key = os.environ.get("ENGINE_SECRETS_KEY")
    if not hex_key:
        raise RuntimeError(
            "ENGINE_SECRETS_KEY not set. Generate with: openssl rand -hex 32"
        )
    if len(hex_key) != 64:
        raise RuntimeError(
            f"ENGINE_SECRETS_KEY must be 64 hex chars, got {len(hex_key)}"
        )
    return bytes.fromhex(hex_key)


def decrypt_secret(
    encrypted_b64: str, iv_b64: str, auth_tag_b64: str
) -> str:
    """Decrypt an AES-256-GCM encrypted secret.

    Matches the encryption format from lib/encryption.ts.
    Raises on any failure (key missing, tamper, decryption error).
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    key = get_encryption_key()
    iv = base64.b64decode(iv_b64)
    auth_tag = base64.b64decode(auth_tag_b64)
    ciphertext = base64.b64decode(encrypted_b64)

    # AESGCM expects ciphertext + authTag concatenated
    aesgcm = AESGCM(key)
    plaintext_bytes = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
    return plaintext_bytes.decode("utf-8")


def load_engine_secrets(supabase_client, engine_id: str) -> dict[str, str]:
    """Load and decrypt all secrets for an engine from DB.

    Returns dict {secret_name: plaintext_value}.
    Returns empty dict if no secrets or decryption fails (logged).
    """
    try:
        res = (
            supabase_client.table("engine_secrets")
            .select("secret_name, secret_value_encrypted, iv, auth_tag")
            .eq("engine_id", engine_id)
            .execute()
        )
    except Exception as e:
        print(f"[secrets] query failed for {engine_id}: {e}")
        return {}

    secrets: dict[str, str] = {}
    for row in res.data or []:
        try:
            secrets[row["secret_name"]] = decrypt_secret(
                row["secret_value_encrypted"],
                row["iv"],
                row["auth_tag"],
            )
        except Exception as e:
            print(f"[secrets] decrypt failed for {engine_id}/{row['secret_name']}: {e}")

    return secrets
