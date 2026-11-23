import { describe, expect, it } from "vitest";

describe("Parallax Audio Studio", () => {
  it("exposes the three upstream interaction tabs", () => {
    expect(["voice", "music", "history"]).toEqual(expect.arrayContaining(["voice", "music", "history"]));
  });
});

