export type ResearchWatchlistMode = "news" | "tutorial" | "product" | "competitor";
export type ResearchWatchlistStatus = "active" | "paused";
export type ResearchWatchlistEventStatus = "new" | "draft_created" | "dismissed";

export interface WatchlistWriteInput {
  name?: unknown;
  topic?: unknown;
  url?: unknown;
  mode?: unknown;
  status?: unknown;
}

export interface NormalizedWatchlistWrite {
  name: string;
  topic: string;
  url: string;
  mode: ResearchWatchlistMode;
  status: ResearchWatchlistStatus;
}

export interface ChangedetectionWebhookInput {
  watchlist_id?: unknown;
  url?: unknown;
  title?: unknown;
  summary?: unknown;
  change_url?: unknown;
  snapshot_url?: unknown;
  detected_at?: unknown;
}

export interface NormalizedChangedetectionEvent {
  watchlistId: string;
  url: string;
  title: string | null;
  summary: string | null;
  changeUrl: string | null;
  snapshotUrl: string | null;
  detectedAt: string;
}

/**
 * Tolerant input for the path-based webhook (POST .../changedetection/[watchlist_id]).
 * Accepts the Apprise/changedetection default shape (title/message/body/text)
 * as well as the flat shape, so changedetection does not need a custom JSON body.
 */
export interface ChangedetectionPathWebhookInput {
  url?: unknown;
  title?: unknown;
  summary?: unknown;
  message?: unknown;
  body?: unknown;
  text?: unknown;
  change_url?: unknown;
  snapshot_url?: unknown;
  detected_at?: unknown;
}

const MODES: ResearchWatchlistMode[] = ["news", "tutorial", "product", "competitor"];
const STATUSES: ResearchWatchlistStatus[] = ["active", "paused"];

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertHttpUrl(value: string, field: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${field} must be an http/https URL`;
    }
    return null;
  } catch {
    return `${field} must be a valid URL`;
  }
}

export function normalizeWatchlistWrite(input: WatchlistWriteInput): {
  ok: true;
  value: NormalizedWatchlistWrite;
} | {
  ok: false;
  error: string;
} {
  const name = asString(input.name);
  const topic = asString(input.topic);
  const url = asString(input.url);
  const mode = asString(input.mode) || "news";
  const status = asString(input.status) || "active";

  if (name.length < 2 || name.length > 120) {
    return { ok: false, error: "name must be between 2 and 120 characters" };
  }
  if (topic.length < 3 || topic.length > 500) {
    return { ok: false, error: "topic must be between 3 and 500 characters" };
  }
  const urlError = assertHttpUrl(url, "url");
  if (urlError) return { ok: false, error: urlError };
  if (!MODES.includes(mode as ResearchWatchlistMode)) {
    return { ok: false, error: "mode must be one of: news, tutorial, product, competitor" };
  }
  if (!STATUSES.includes(status as ResearchWatchlistStatus)) {
    return { ok: false, error: "status must be active or paused" };
  }

  return {
    ok: true,
    value: {
      name,
      topic,
      url,
      mode: mode as ResearchWatchlistMode,
      status: status as ResearchWatchlistStatus,
    },
  };
}

export function normalizeChangedetectionWebhook(input: ChangedetectionWebhookInput): {
  ok: true;
  value: NormalizedChangedetectionEvent;
} | {
  ok: false;
  error: string;
} {
  const watchlistId = asString(input.watchlist_id);
  const url = asString(input.url);
  const title = asString(input.title);
  const summary = asString(input.summary);
  const changeUrl = asString(input.change_url);
  const snapshotUrl = asString(input.snapshot_url);
  const detectedAtRaw = asString(input.detected_at);

  if (!watchlistId) return { ok: false, error: "watchlist_id is required" };
  const urlError = assertHttpUrl(url, "url");
  if (urlError) return { ok: false, error: urlError };
  if (changeUrl) {
    const changeUrlError = assertHttpUrl(changeUrl, "change_url");
    if (changeUrlError) return { ok: false, error: changeUrlError };
  }
  if (snapshotUrl) {
    const snapshotUrlError = assertHttpUrl(snapshotUrl, "snapshot_url");
    if (snapshotUrlError) return { ok: false, error: snapshotUrlError };
  }

  const detectedAt = detectedAtRaw && !Number.isNaN(Date.parse(detectedAtRaw))
    ? new Date(detectedAtRaw).toISOString()
    : new Date().toISOString();

  return {
    ok: true,
    value: {
      watchlistId,
      url,
      title: title || null,
      summary: summary || null,
      changeUrl: changeUrl || null,
      snapshotUrl: snapshotUrl || null,
      detectedAt,
    },
  };
}

/**
 * Normalize a path-based changedetection webhook.
 * watchlistId comes from the path param; url falls back to the watchlist's
 * stored url when the body omits a valid one (Apprise does not send the
 * watched url). Summary is extracted best-effort from message/body/text.
 */
export function normalizeChangedetectionPathWebhook(
  watchlistId: string,
  input: ChangedetectionPathWebhookInput,
  fallbackUrl: string,
): {
  ok: true;
  value: NormalizedChangedetectionEvent;
} | {
  ok: false;
  error: string;
} {
  const id = asString(watchlistId);
  if (!id) return { ok: false, error: "watchlist_id is required" };

  const title = asString(input.title);
  const summary =
    asString(input.message) ||
    asString(input.body) ||
    asString(input.text) ||
    asString(input.summary);

  const bodyUrl = asString(input.url);
  const bodyUrlValid = bodyUrl !== "" && assertHttpUrl(bodyUrl, "url") === null;
  const url = bodyUrlValid ? bodyUrl : asString(fallbackUrl);
  const urlError = assertHttpUrl(url, "url");
  if (urlError) return { ok: false, error: urlError };

  const changeUrl = asString(input.change_url);
  if (changeUrl) {
    const changeUrlError = assertHttpUrl(changeUrl, "change_url");
    if (changeUrlError) return { ok: false, error: changeUrlError };
  }
  const snapshotUrl = asString(input.snapshot_url);
  if (snapshotUrl) {
    const snapshotUrlError = assertHttpUrl(snapshotUrl, "snapshot_url");
    if (snapshotUrlError) return { ok: false, error: snapshotUrlError };
  }

  const detectedAtRaw = asString(input.detected_at);
  const detectedAt = detectedAtRaw && !Number.isNaN(Date.parse(detectedAtRaw))
    ? new Date(detectedAtRaw).toISOString()
    : new Date().toISOString();

  return {
    ok: true,
    value: {
      watchlistId: id,
      url,
      title: title || null,
      summary: summary || null,
      changeUrl: changeUrl || null,
      snapshotUrl: snapshotUrl || null,
      detectedAt,
    },
  };
}

export function topicFromWatchlistEvent(watchlistTopic: string, eventTitle: string | null) {
  if (!eventTitle) return watchlistTopic;
  return `${watchlistTopic}: ${eventTitle}`.slice(0, 500);
}
