import { createHash } from "crypto";
import type { JoggAvatar } from "@/lib/jogg-client";
import {
  canLinkExistingVideoPresenter,
} from "@/lib/video-presenter-admin";
import type { VideoPresenterStatus } from "@/lib/video-presenters";

export interface ManualVideoPresenterRequest {
  id: string;
  userId: string;
  name: string;
  status: VideoPresenterStatus;
  sourceVideoPath: string;
  consentVideoPath: string;
  consentConfirmedAt: string;
  consentStatementVersion: string;
}

export interface ExistingPresenterRecord {
  id: string;
  externalAvatarId: string | null;
}

export interface InsertPresenterInput {
  userId: string;
  name: string;
  portraitPath: string;
  imageSha256: string;
  externalAvatarId: string;
  consentConfirmedAt: string;
  consentStatementVersion: string;
}

export interface ManualVideoPresenterLinkDependencies {
  listCompletedAvatars: () => Promise<JoggAvatar[]>;
  fetchCover: (url: string) => Promise<Buffer>;
  normalizeCover: (input: Buffer) => Promise<Buffer>;
  makePortraitPath: (userId: string) => string;
  findPresenterByExternalId: (
    userId: string,
    externalAvatarId: string,
  ) => Promise<ExistingPresenterRecord | null>;
  findPresenterByImageHash: (
    userId: string,
    imageSha256: string,
  ) => Promise<ExistingPresenterRecord | null>;
  storePortrait: (path: string, bytes: Buffer) => Promise<void>;
  deletePortrait: (path: string) => Promise<void>;
  insertPresenter: (input: InsertPresenterInput) => Promise<{ id: string }>;
  markRequestReady: (input: {
    requestId: string;
    previousStatus: VideoPresenterStatus;
    presenterId: string;
    externalAvatarId: string;
    readyAt: string;
  }) => Promise<boolean>;
  cleanupFootage: (paths: string[]) => Promise<boolean>;
  now?: () => string;
}

export class ManualVideoPresenterLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ManualVideoPresenterLinkError";
  }
}

export function normalizeExternalAvatarId(value: unknown) {
  const text =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^[1-9]\d*$/.test(text)) {
    throw new ManualVideoPresenterLinkError(
      "Enter a valid completed presenter ID.",
      400,
    );
  }
  return text;
}

export async function linkExistingVideoPresenter(
  request: ManualVideoPresenterRequest,
  rawAvatarId: unknown,
  deps: ManualVideoPresenterLinkDependencies,
) {
  if (!canLinkExistingVideoPresenter(request.status)) {
    throw new ManualVideoPresenterLinkError(
      "This request cannot be linked in its current state.",
      409,
    );
  }

  const externalAvatarId = normalizeExternalAvatarId(rawAvatarId);
  let presenter = await deps.findPresenterByExternalId(
    request.userId,
    externalAvatarId,
  );
  let reused = Boolean(presenter);

  if (!presenter) {
    const avatars = await deps.listCompletedAvatars();
    const avatar = avatars.find((candidate) => String(candidate.id) === externalAvatarId);
    if (!avatar) {
      throw new ManualVideoPresenterLinkError(
        "The completed presenter was not found in the account catalog.",
        404,
      );
    }
    if (!avatar.thumbUrl) {
      throw new ManualVideoPresenterLinkError(
        "The completed presenter does not have a usable preview yet.",
        409,
      );
    }

    const cover = await deps.fetchCover(avatar.thumbUrl);
    const normalized = await deps.normalizeCover(cover);
    const imageSha256 = createHash("sha256").update(normalized).digest("hex");
    const duplicate = await deps.findPresenterByImageHash(
      request.userId,
      imageSha256,
    );
    if (duplicate) {
      if (duplicate.externalAvatarId !== externalAvatarId) {
        throw new ManualVideoPresenterLinkError(
          "This presenter preview is already linked to another account presenter.",
          409,
        );
      }
      presenter = duplicate;
      reused = true;
    } else {
      const portraitPath = deps.makePortraitPath(request.userId);
      await deps.storePortrait(portraitPath, normalized);
      try {
        const inserted = await deps.insertPresenter({
          userId: request.userId,
          name: request.name,
          portraitPath,
          imageSha256,
          externalAvatarId,
          consentConfirmedAt: request.consentConfirmedAt,
          consentStatementVersion: request.consentStatementVersion,
        });
        presenter = {
          id: inserted.id,
          externalAvatarId,
        };
      } catch (error) {
        await deps.deletePortrait(portraitPath).catch(() => undefined);
        throw error;
      }
    }
  }

  if (!presenter) {
    throw new Error("Presenter linking completed without a presenter record");
  }

  const updated = await deps.markRequestReady({
    requestId: request.id,
    previousStatus: request.status,
    presenterId: presenter.id,
    externalAvatarId,
    readyAt: (deps.now ?? (() => new Date().toISOString()))(),
  });
  if (!updated) {
    throw new ManualVideoPresenterLinkError(
      "The request changed while the presenter was being linked. Refresh and try again.",
      409,
    );
  }

  const cleanupPending = !(await deps.cleanupFootage([
    request.sourceVideoPath,
    request.consentVideoPath,
  ]));

  return {
    presenterId: presenter.id,
    reused,
    cleanupPending,
  };
}
