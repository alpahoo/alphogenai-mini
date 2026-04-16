/**
 * AES-256-GCM encryption for engine secrets (API keys, etc.)
 *
 * - Uses Node's built-in `crypto` module (no external deps)
 * - 256-bit key from `ENGINE_SECRETS_KEY` env var (64 hex chars = 32 bytes)
 * - Generate key: `openssl rand -hex 32`
 * - Output format: base64-encoded ciphertext + IV + auth tag (separate columns)
 */
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard

export interface EncryptedSecret {
  encrypted: string; // base64
  iv: string; // base64
  authTag: string; // base64
}

function getKey(): Buffer {
  const hex = process.env.ENGINE_SECRETS_KEY;
  if (!hex) {
    throw new Error(
      "ENGINE_SECRETS_KEY not set. Generate with: openssl rand -hex 32"
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      "ENGINE_SECRETS_KEY must be 64 hex characters (32 bytes / 256 bits)"
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt a plaintext secret using AES-256-GCM.
 * Returns base64-encoded ciphertext, IV, and auth tag.
 */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/**
 * Decrypt a previously encrypted secret.
 * Throws if auth tag verification fails (tamper detection).
 */
export function decryptSecret(secret: EncryptedSecret): string {
  const key = getKey();
  const iv = Buffer.from(secret.iv, "base64");
  const authTag = Buffer.from(secret.authTag, "base64");
  const encrypted = Buffer.from(secret.encrypted, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Mask a secret for display (shows first 4 chars + last 4 chars).
 * Example: "sk_1234567890abcdef" → "sk_1...cdef"
 */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "***";
  return `${plaintext.slice(0, 4)}...${plaintext.slice(-4)}`;
}
