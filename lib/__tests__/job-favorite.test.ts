import { describe, expect, it } from "vitest";
import { isJobFavorite, withJobFavorite } from "@/lib/job-favorite";

describe("job favorite helpers", () => {
  it("reads the favorite flag only when it is explicitly true", () => {
    expect(isJobFavorite({ favorite: true })).toBe(true);
    expect(isJobFavorite({ favorite: false })).toBe(false);
    expect(isJobFavorite({ favorite: "true" })).toBe(false);
    expect(isJobFavorite({})).toBe(false);
    expect(isJobFavorite(null)).toBe(false);
  });

  it("sets the favorite flag while preserving other app state", () => {
    expect(withJobFavorite({ stage: "done", favorite: false }, true)).toEqual({
      stage: "done",
      favorite: true,
    });
    expect(withJobFavorite({ stage: "done", favorite: true }, false)).toEqual({
      stage: "done",
      favorite: false,
    });
  });

  it("recovers from non-object app_state values", () => {
    expect(withJobFavorite(null, true)).toEqual({ favorite: true });
    expect(withJobFavorite(["bad"], true)).toEqual({ favorite: true });
    expect(withJobFavorite("bad", false)).toEqual({ favorite: false });
  });
});
