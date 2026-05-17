import { describe, it, expect } from "vitest";
import { validateReferences } from "../validate-references";
import type { ReferenceItem } from "../types";
import type { ReferencePayload } from "../types";

// ---------------------------------------------------------------------------
// Helpers — build minimal valid ReferenceItem shapes
// ---------------------------------------------------------------------------

function makeImageRef(
  overrides: Partial<ReferenceItem> = {},
): ReferenceItem {
  return {
    role: "character_face",
    url: "https://example.com/face.jpg",
    ...overrides,
  };
}

const USER_ID = "user-abc-123";

// ---------------------------------------------------------------------------
// 1. Count limit
// ---------------------------------------------------------------------------

describe("validateReferences — count limit", () => {
  it("accepts exactly 9 images", () => {
    const refs: ReferencePayload = {
      images: Array.from({ length: 9 }, () => makeImageRef()),
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("rejects 10 images", () => {
    const refs: ReferencePayload = {
      images: Array.from({ length: 10 }, () => makeImageRef()),
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("TOO_MANY_REFERENCE_IMAGES");
    expect(result!.status).toBe(400);
  });

  it("rejects 20 images", () => {
    const refs: ReferencePayload = {
      images: Array.from({ length: 20 }, () => makeImageRef()),
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("TOO_MANY_REFERENCE_IMAGES");
  });
});

// ---------------------------------------------------------------------------
// 2. Role validation
// ---------------------------------------------------------------------------

describe("validateReferences — role validation", () => {
  it("accepts character_face for images", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "character_face" })],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("accepts outfit_style for images", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "outfit_style" })],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("rejects camera_motion for images", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "camera_motion" })],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("INVALID_REFERENCE_ROLE");
    expect(result!.status).toBe(400);
    expect(result!.error).toContain("camera_motion");
    expect(result!.error).toContain("images");
  });

  it("rejects mood for images", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "mood" })],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("INVALID_REFERENCE_ROLE");
  });

  it("accepts camera_motion for videos", () => {
    const refs: ReferencePayload = {
      videos: [{ role: "camera_motion", url: "https://example.com/vid.mp4" }],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("rejects character_face for videos", () => {
    const refs: ReferencePayload = {
      videos: [{ role: "character_face", url: "https://example.com/vid.mp4" }],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("INVALID_REFERENCE_ROLE");
  });

  it("accepts mood for audio", () => {
    const refs: ReferencePayload = {
      audio: [{ role: "mood", url: "https://example.com/audio.mp3" }],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("rejects character_face for audio", () => {
    const refs: ReferencePayload = {
      audio: [{ role: "character_face", url: "https://example.com/audio.mp3" }],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("INVALID_REFERENCE_ROLE");
  });
});

// ---------------------------------------------------------------------------
// 3. Ownership validation (storage_path)
// ---------------------------------------------------------------------------

describe("validateReferences — ownership validation", () => {
  it("accepts valid storage_path matching userId", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: `${USER_ID}/photo.jpg`,
        }),
      ],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("rejects storage_path belonging to another user", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: "other-user/photo.jpg",
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
    expect(result!.status).toBe(400);
  });

  it("rejects path traversal (..)", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: `${USER_ID}/../other-user/secret.jpg`,
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
  });

  it("rejects leading slash (absolute path)", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: `/user/photo.jpg`,
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
  });

  it("rejects path starting with references/ (bucket name leak)", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: `references/${USER_ID}/photo.jpg`,
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
  });

  it("rejects empty string storage_path", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: "",
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
  });

  it("rejects whitespace-only storage_path", () => {
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: "   ",
        }),
      ],
    };
    const result = validateReferences(refs, USER_ID);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("STORAGE_PATH_OWNERSHIP_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// 4. Legacy V0 compatibility
// ---------------------------------------------------------------------------

describe("validateReferences — legacy V0 compatibility", () => {
  it("accepts ref with url only (no storage_path)", () => {
    const refs: ReferencePayload = {
      images: [
        {
          role: "character_face",
          url: "https://cdn.alphogen.com/legacy/face.jpg",
          // no storage_path — V0 legacy
        },
      ],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("accepts ref with url and undefined storage_path", () => {
    const refs: ReferencePayload = {
      images: [
        {
          role: "outfit_style",
          url: "https://cdn.alphogen.com/legacy/outfit.jpg",
          storage_path: undefined,
        },
      ],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Empty / edge cases
// ---------------------------------------------------------------------------

describe("validateReferences — empty and edge cases", () => {
  it("accepts empty object", () => {
    const refs = {} as ReferencePayload;
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("accepts undefined images array", () => {
    const refs = { images: undefined } as unknown as ReferencePayload;
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("accepts empty images array", () => {
    const refs: ReferencePayload = { images: [] };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });

  it("accepts when userId is undefined (anonymous context)", () => {
    // When userId is undefined, ownership check is skipped but other
    // checks (count, role) still run
    const refs: ReferencePayload = {
      images: [
        makeImageRef({
          storage_path: "some-path/photo.jpg",
        }),
      ],
    };
    expect(validateReferences(refs, undefined)).toBeNull();
  });

  it("still validates roles even when userId is undefined", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "camera_motion" })],
    };
    const result = validateReferences(refs, undefined);
    expect(result).not.toBeNull();
    expect(result!.code).toBe("INVALID_REFERENCE_ROLE");
  });

  it("validates multiple categories together", () => {
    const refs: ReferencePayload = {
      images: [makeImageRef({ role: "character_face", storage_path: `${USER_ID}/face.jpg` })],
      videos: [{ role: "camera_motion", url: "https://example.com/vid.mp4" }],
      audio: [{ role: "mood", url: "https://example.com/audio.mp3" }],
    };
    expect(validateReferences(refs, USER_ID)).toBeNull();
  });
});
