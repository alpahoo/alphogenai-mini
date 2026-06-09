/**
 * V1 Étape C — Reference validation (server-side, pure function).
 *
 * Extracted from app/api/jobs/route.ts for testability.
 * Zero I/O, zero fetch, zero DB — purely checks the payload shape.
 */

import type { ReferencePayload, ReferenceItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_REFERENCE_IMAGES = 9; // EvoLink cap

/** Valid roles per media category (Étape C) */
export const VALID_ROLES: Record<string, readonly string[]> = {
  images: ["character_face", "product_reference", "outfit_reference", "outfit_style"],
  videos: ["camera_motion"],
  audio: ["mood"],
};

// ---------------------------------------------------------------------------
// Validation result type
// ---------------------------------------------------------------------------

export interface ValidationError {
  error: string;
  code: string;
  status: number;
}

// ---------------------------------------------------------------------------
// Pure validation function
// ---------------------------------------------------------------------------

/**
 * Validate the references payload. Returns null if valid, or a
 * `{ error, code, status }` object for the first violation found.
 *
 * Checks (in order):
 *   1. Max image count (≤9)
 *   2. Role validation per category
 *   3. storage_path ownership (traversal, empty, wrong user)
 *
 * Legacy V0 compat: refs with only `url` (no `storage_path`) pass through.
 */
export function validateReferences(
  refs: ReferencePayload,
  userId: string | undefined,
): ValidationError | null {
  // 2.1 — Max image count
  if (Array.isArray(refs.images) && refs.images.length > MAX_REFERENCE_IMAGES) {
    return {
      error: `Too many reference images (max ${MAX_REFERENCE_IMAGES})`,
      code: "TOO_MANY_REFERENCE_IMAGES",
      status: 400,
    };
  }

  // 2.2 — Role validation per category + 2.3 — storage_path ownership
  for (const [category, items] of Object.entries(refs)) {
    const allowedRoles = VALID_ROLES[category];
    if (!allowedRoles || !Array.isArray(items)) continue;

    for (const item of items as ReferenceItem[]) {
      // Role validation
      if (item.role && !allowedRoles.includes(item.role)) {
        return {
          error: `Invalid reference role "${item.role}" for category "${category}". Allowed: ${allowedRoles.join(", ")}`,
          code: "INVALID_REFERENCE_ROLE",
          status: 400,
        };
      }

      // Storage path ownership (only when storage_path is present — V0
      // legacy refs with only `url` are allowed through for compat)
      if (typeof item.storage_path === "string") {
        const sp = item.storage_path;

        // Empty / whitespace-only
        if (sp.trim().length === 0) {
          return {
            error: "Storage path does not belong to user",
            code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
            status: 400,
          };
        }

        // Path traversal
        if (sp.includes("..")) {
          return {
            error: "Storage path does not belong to user",
            code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
            status: 400,
          };
        }

        // Must not start with "/" (absolute path in bucket)
        if (sp.startsWith("/")) {
          return {
            error: "Storage path does not belong to user",
            code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
            status: 400,
          };
        }

        // Must not start with "references/" (bucket name leak into path)
        if (sp.startsWith("references/")) {
          return {
            error: "Storage path does not belong to user",
            code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
            status: 400,
          };
        }

        // Ownership: must start with user's ID
        if (userId && !sp.startsWith(`${userId}/`)) {
          return {
            error: "Storage path does not belong to user",
            code: "STORAGE_PATH_OWNERSHIP_MISMATCH",
            status: 400,
          };
        }
      }
    }
  }

  return null; // All checks passed
}

