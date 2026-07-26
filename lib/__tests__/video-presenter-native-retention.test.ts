import { describe, expect, it, vi } from "vitest";
import { expireNativePresenterBase } from "@/lib/video-presenter-native-retention";

const BASE = {
  id: "base-1",
  userId: "user-1",
  videoPath: "user-1/base-1/base.mp4",
};

describe("native presenter retention cleanup", () => {
  it("deletes storage before marking the row removed", async () => {
    const calls: string[] = [];
    const result = await expireNativePresenterBase(BASE, {
      removeObject: async () => {
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
      removeObject: async () => false,
      markRemoved,
    });
    expect(result).toBe("error");
    expect(markRemoved).not.toHaveBeenCalled();
  });

  it("reports an error when the file is gone but state persistence fails", async () => {
    const result = await expireNativePresenterBase(BASE, {
      removeObject: async () => true,
      markRemoved: async () => false,
    });
    expect(result).toBe("error");
  });
});
