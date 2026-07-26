import { describe, expect, it, vi } from "vitest";
import {
  expireNativePresenterBase,
  isNativeNormalizationActive,
} from "@/lib/video-presenter-native-retention";

const BASE = {
  id: "base-1",
  userId: "user-1",
  videoPath: "user-1/base-1/base.mp4",
};

describe("native presenter retention cleanup", () => {
  it("protects a recent normalization but releases a stale one for cleanup", () => {
    const now = Date.parse("2026-07-26T14:00:00.000Z");
    expect(
      isNativeNormalizationActive(
        "normalizing",
        "2026-07-26T13:00:01.000Z",
        now,
      ),
    ).toBe(true);
    expect(
      isNativeNormalizationActive(
        "normalizing",
        "2026-07-26T11:59:59.000Z",
        now,
      ),
    ).toBe(false);
    expect(
      isNativeNormalizationActive("ready", "2026-07-26T13:59:59.000Z", now),
    ).toBe(false);
  });

  it("deletes storage before marking the row removed", async () => {
    const calls: string[] = [];
    const result = await expireNativePresenterBase(BASE, {
      removeObjects: async (paths) => {
        expect(paths).toEqual(["user-1/base-1/base.mp4"]);
        calls.push("storage");
        return true;
      },
      markRemoved: async (id, userId, deletedAt) => {
        calls.push("database");
        expect({ id, userId, deletedAt }).toEqual({
          id: "base-1",
          userId: "user-1",
          deletedAt: "2026-07-26T12:00:00.000Z",
        });
        return true;
      },
      now: () => "2026-07-26T12:00:00.000Z",
    });
    expect(result).toBe("removed");
    expect(calls).toEqual(["storage", "database"]);
  });

  it("keeps the database row actionable when storage deletion fails", async () => {
    const markRemoved = vi.fn();
    const result = await expireNativePresenterBase(BASE, {
      removeObjects: async () => false,
      markRemoved,
    });
    expect(result).toBe("error");
    expect(markRemoved).not.toHaveBeenCalled();
  });

  it("reports an error when the file is gone but state persistence fails", async () => {
    const result = await expireNativePresenterBase(BASE, {
      removeObjects: async () => true,
      markRemoved: async () => false,
    });
    expect(result).toBe("error");
  });

  it("deletes the retained source and normalized private copy together", async () => {
    const removeObjects = vi.fn().mockResolvedValue(true);
    await expireNativePresenterBase(
      {
        ...BASE,
        normalizedVideoPath: "user-1/base-1/normalized-v1.mp4",
      },
      {
        removeObjects,
        markRemoved: async () => true,
      },
    );
    expect(removeObjects).toHaveBeenCalledWith([
      "user-1/base-1/base.mp4",
      "user-1/base-1/normalized-v1.mp4",
    ]);
  });
});
