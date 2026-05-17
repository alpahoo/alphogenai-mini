import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptSecret, decryptSecret, maskSecret } from "../encryption";

// ---------------------------------------------------------------------------
// 1. maskSecret — pure function, no env needed
// ---------------------------------------------------------------------------

describe("maskSecret", () => {
  it("masks long secrets showing first 4 + last 4", () => {
    expect(maskSecret("sk_1234567890abcdef")).toBe("sk_1...cdef");
  });

  it("masks 9-char string", () => {
    expect(maskSecret("123456789")).toBe("1234...6789");
  });

  it("returns *** for 8-char string", () => {
    expect(maskSecret("12345678")).toBe("***");
  });

  it("returns *** for short strings", () => {
    expect(maskSecret("abc")).toBe("***");
  });

  it("returns *** for empty string", () => {
    expect(maskSecret("")).toBe("***");
  });
});

// ---------------------------------------------------------------------------
// 2. encrypt/decrypt round-trip — needs ENGINE_SECRETS_KEY
// ---------------------------------------------------------------------------

// Use a test-only key (32 bytes = 64 hex chars)
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryptSecret + decryptSecret round-trip", () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENGINE_SECRETS_KEY;
    process.env.ENGINE_SECRETS_KEY = TEST_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENGINE_SECRETS_KEY = originalKey;
    } else {
      delete process.env.ENGINE_SECRETS_KEY;
    }
  });

  it("encrypts and decrypts a simple string", () => {
    const plaintext = "my-secret-api-key";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts empty string", () => {
    const encrypted = encryptSecret("");
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe("");
  });

  it("encrypts and decrypts unicode", () => {
    const plaintext = "clé-secrète-éàü-🔑";
    const encrypted = encryptSecret(plaintext);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a.encrypted).not.toBe(b.encrypted);
    expect(a.iv).not.toBe(b.iv);
  });

  it("encrypted result has all required fields", () => {
    const encrypted = encryptSecret("test");
    expect(typeof encrypted.encrypted).toBe("string");
    expect(typeof encrypted.iv).toBe("string");
    expect(typeof encrypted.authTag).toBe("string");
    expect(encrypted.encrypted.length).toBeGreaterThan(0);
    expect(encrypted.iv.length).toBeGreaterThan(0);
    expect(encrypted.authTag.length).toBeGreaterThan(0);
  });

  it("tampered ciphertext throws on decrypt", () => {
    const encrypted = encryptSecret("sensitive-data");
    const tampered = { ...encrypted, encrypted: "dGFtcGVyZWQ=" }; // "tampered" in base64
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("tampered auth tag throws on decrypt", () => {
    const encrypted = encryptSecret("sensitive-data");
    const tampered = { ...encrypted, authTag: "AAAAAAAAAAAAAAAAAAAAAA==" };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Key validation
// ---------------------------------------------------------------------------

describe("encryption — key validation", () => {
  let originalKey: string | undefined;

  beforeAll(() => {
    originalKey = process.env.ENGINE_SECRETS_KEY;
  });

  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.ENGINE_SECRETS_KEY = originalKey;
    } else {
      delete process.env.ENGINE_SECRETS_KEY;
    }
  });

  it("throws when ENGINE_SECRETS_KEY is not set", () => {
    delete process.env.ENGINE_SECRETS_KEY;
    expect(() => encryptSecret("test")).toThrow("ENGINE_SECRETS_KEY not set");
  });

  it("throws when ENGINE_SECRETS_KEY is wrong length", () => {
    process.env.ENGINE_SECRETS_KEY = "tooshort";
    expect(() => encryptSecret("test")).toThrow("64 hex characters");
  });
});
