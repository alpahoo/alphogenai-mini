import { describe, expect, it, vi } from "vitest";
import {
  linkExistingVideoPresenter,
  ManualVideoPresenterLinkError,
  normalizeExternalAvatarId,
  type ManualVideoPresenterLinkDependencies,
} from "../video-presenter-manual-link";

const REQUEST = {
  id: "request-1",
  userId: "user-1",
  name: "Maya",
  status: "needs_login" as const,
  sourceVideoPath: "user-1/request-1/source.mp4",
  consentVideoPath: "user-1/request-1/consent.mp4",
  consentConfirmedAt: "2026-07-26T10:00:00.000Z",
  consentStatementVersion: "v1",
};

function dependencies(
  overrides: Partial<ManualVideoPresenterLinkDependencies> = {},
): ManualVideoPresenterLinkDependencies {
  return {
    listCompletedAvatars: vi.fn().mockResolvedValue([
      {
        id: 445593,
        name: "Maya",
        gender: "Female",
        thumbUrl: "https://cdn.example.com/maya.jpg",
        type: 1,
        kind: "custom",
        aspectRatio: "portrait",
      },
    ]),
    fetchCover: vi.fn().mockResolvedValue(Buffer.from("cover")),
    normalizeCover: vi.fn().mockResolvedValue(Buffer.from("normalized-cover")),
    makePortraitPath: vi.fn().mockReturnValue("user-1/new.jpg"),
    findPresenterByExternalId: vi.fn().mockResolvedValue(null),
    findPresenterByImageHash: vi.fn().mockResolvedValue(null),
    storePortrait: vi.fn().mockResolvedValue(undefined),
    deletePortrait: vi.fn().mockResolvedValue(undefined),
    insertPresenter: vi.fn().mockResolvedValue({ id: "presenter-1" }),
    markRequestReady: vi.fn().mockResolvedValue(true),
    cleanupFootage: vi.fn().mockResolvedValue(true),
    now: vi.fn().mockReturnValue("2026-07-26T12:00:00.000Z"),
    ...overrides,
  };
}

describe("manual video presenter linking", () => {
  it("normalizes positive numeric presenter ids", () => {
    expect(normalizeExternalAvatarId(" 445593 ")).toBe("445593");
    expect(normalizeExternalAvatarId(445593)).toBe("445593");
    expect(() => normalizeExternalAvatarId("0")).toThrow(ManualVideoPresenterLinkError);
    expect(() => normalizeExternalAvatarId("45x")).toThrow(ManualVideoPresenterLinkError);
  });

  it("verifies, publishes, links, and cleans a completed presenter", async () => {
    const deps = dependencies();
    const result = await linkExistingVideoPresenter(REQUEST, "445593", deps);

    expect(result).toEqual({
      presenterId: "presenter-1",
      reused: false,
      cleanupPending: false,
    });
    expect(deps.fetchCover).toHaveBeenCalledWith("https://cdn.example.com/maya.jpg");
    expect(deps.storePortrait).toHaveBeenCalledWith(
      "user-1/new.jpg",
      Buffer.from("normalized-cover"),
    );
    expect(deps.insertPresenter).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        name: "Maya",
        externalAvatarId: "445593",
        consentConfirmedAt: REQUEST.consentConfirmedAt,
      }),
    );
    expect(deps.markRequestReady).toHaveBeenCalledWith({
      requestId: "request-1",
      previousStatus: "needs_login",
      presenterId: "presenter-1",
      externalAvatarId: "445593",
      readyAt: "2026-07-26T12:00:00.000Z",
    });
    expect(deps.cleanupFootage).toHaveBeenCalledWith([
      REQUEST.sourceVideoPath,
      REQUEST.consentVideoPath,
    ]);
  });

  it("reuses an already published presenter without downloading it again", async () => {
    const deps = dependencies({
      findPresenterByExternalId: vi
        .fn()
        .mockResolvedValue({ id: "presenter-existing", externalAvatarId: "445593" }),
    });
    const result = await linkExistingVideoPresenter(REQUEST, "445593", deps);

    expect(result.reused).toBe(true);
    expect(result.presenterId).toBe("presenter-existing");
    expect(deps.listCompletedAvatars).not.toHaveBeenCalled();
    expect(deps.fetchCover).not.toHaveBeenCalled();
    expect(deps.insertPresenter).not.toHaveBeenCalled();
  });

  it("rejects an id that is not in the completed account catalog", async () => {
    const deps = dependencies({ listCompletedAvatars: vi.fn().mockResolvedValue([]) });
    await expect(
      linkExistingVideoPresenter(REQUEST, "445593", deps),
    ).rejects.toMatchObject({
      status: 404,
      message: "The completed presenter was not found in the account catalog.",
    });
    expect(deps.storePortrait).not.toHaveBeenCalled();
    expect(deps.markRequestReady).not.toHaveBeenCalled();
  });

  it("keeps the successful link when private-footage cleanup must be retried", async () => {
    const deps = dependencies({ cleanupFootage: vi.fn().mockResolvedValue(false) });
    const result = await linkExistingVideoPresenter(REQUEST, "445593", deps);
    expect(result.cleanupPending).toBe(true);
    expect(deps.markRequestReady).toHaveBeenCalledOnce();
  });

  it("allows a fresh unclaimed pending request to use the manual path", async () => {
    const deps = dependencies();
    const result = await linkExistingVideoPresenter(
      { ...REQUEST, status: "pending" },
      "445593",
      deps,
    );
    expect(result.presenterId).toBe("presenter-1");
    expect(deps.markRequestReady).toHaveBeenCalledWith(
      expect.objectContaining({ previousStatus: "pending" }),
    );
  });

  it("removes a newly uploaded portrait when the presenter row cannot be inserted", async () => {
    const deps = dependencies({
      insertPresenter: vi.fn().mockRejectedValue(new Error("db down")),
    });
    await expect(
      linkExistingVideoPresenter(REQUEST, "445593", deps),
    ).rejects.toThrow("db down");
    expect(deps.deletePortrait).toHaveBeenCalledWith("user-1/new.jpg");
    expect(deps.markRequestReady).not.toHaveBeenCalled();
  });

  it("does not link requests that may still be owned by an active worker", async () => {
    const deps = dependencies();
    await expect(
      linkExistingVideoPresenter(
        { ...REQUEST, status: "processing" },
        "445593",
        deps,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(deps.findPresenterByExternalId).not.toHaveBeenCalled();
  });
});
