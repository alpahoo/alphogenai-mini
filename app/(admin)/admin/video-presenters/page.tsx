"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

interface RetryPolicy {
  allowed: boolean;
  maySpend: boolean;
  reason: string;
}

interface PresenterRequest {
  id: string;
  userEmail: string;
  name: string;
  status: string;
  errorCode: string | null;
  attempts: number;
  source: { mime: string; sizeBytes: number };
  consent: { mime: string; sizeBytes: number };
  presenterId: string | null;
  claimedAt: string | null;
  submittedAt: string | null;
  readyAt: string | null;
  createdAt: string;
  updatedAt: string;
  retry: RetryPolicy;
  canLinkExisting: boolean;
  canCleanup: boolean;
  canRemove: boolean;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  "uploading",
  "pending",
  "claimed",
  "submitted",
  "processing",
  "ready",
  "failed",
  "needs_login",
  "needs_review",
  "removed",
];

const STATUS_STYLES: Record<string, string> = {
  uploading: "bg-zinc-500/10 text-zinc-500",
  pending: "bg-blue-500/10 text-blue-500",
  claimed: "bg-cyan-500/10 text-cyan-500",
  submitted: "bg-violet-500/10 text-violet-500",
  processing: "bg-amber-500/10 text-amber-500",
  ready: "bg-emerald-500/10 text-emerald-500",
  failed: "bg-red-500/10 text-red-500",
  needs_login: "bg-orange-500/10 text-orange-500",
  needs_review: "bg-rose-500/10 text-rose-500",
  removed: "bg-zinc-500/10 text-zinc-500",
};

function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminVideoPresentersPage() {
  const [requests, setRequests] = useState<PresenterRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkingRequest, setLinkingRequest] = useState<PresenterRequest | null>(null);
  const [avatarId, setAvatarId] = useState("");

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (statusFilter) params.set("status", statusFilter);
      const response = await fetch(`/api/admin/video-presenters?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Could not load presenter requests.");
      setRequests(payload.requests ?? []);
      setPagination((current) => payload.pagination ?? current);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load presenter requests.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const runAction = async (
    item: PresenterRequest,
    action: "retry" | "cleanup" | "remove",
  ) => {
    if (action === "retry" && item.retry.maySpend) {
      const confirmed = window.confirm(
        "This retry may start a paid presenter operation. Continue only after checking that no presenter is already processing.",
      );
      if (!confirmed) return;
    }
    if (action === "remove" && !window.confirm("Remove this request and its private footage?")) {
      return;
    }
    setActingId(item.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/video-presenters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          requestId: item.id,
          confirmSpend: action === "retry" && item.retry.maySpend,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "The action could not be completed.");
      if (payload.cleanupPending) {
        setError("The request was removed, but private-footage cleanup still needs attention.");
      }
      await load(pagination.page);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The action could not be completed.");
    } finally {
      setActingId(null);
    }
  };

  const linkExistingPresenter = async () => {
    if (!linkingRequest || !avatarId.trim()) return;
    setActingId(linkingRequest.id);
    setError(null);
    try {
      const response = await fetch("/api/admin/video-presenters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_existing",
          requestId: linkingRequest.id,
          avatarId: avatarId.trim(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "The completed presenter could not be linked.");
      }
      if (payload.cleanupPending) {
        setError(
          "The presenter is ready, but its private-footage cleanup still needs attention.",
        );
      }
      setLinkingRequest(null);
      setAvatarId("");
      await load(pagination.page);
    } catch (linkError) {
      setError(
        linkError instanceof Error
          ? linkError.message
          : "The completed presenter could not be linked.",
      );
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Video presenters</h1>
          <p className="text-sm text-muted-foreground">
            Monitor private presenter training requests and recover them without blind retries.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(pagination.page)}
          disabled={loading}
          title="Refresh requests"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex items-center gap-3 border-y border-border/50 py-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {pagination.total} request{pagination.total === 1 ? "" : "s"}
        </span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto border border-border/50">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="border-b border-border/50 bg-muted/30 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">Presenter</th>
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Attempts</th>
                <th className="px-3 py-2.5">Private media</th>
                <th className="px-3 py-2.5">Updated</th>
                <th className="px-3 py-2.5">Recovery</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => {
                const acting = actingId === item.id;
                return (
                  <tr key={item.id} className="border-b border-border/30 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium">{item.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {item.id.slice(0, 8)}
                      </p>
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-3 text-xs">
                      {item.userEmail}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium ${STATUS_STYLES[item.status] ?? ""}`}>
                        {item.status.replaceAll("_", " ")}
                      </span>
                      {item.errorCode ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">{item.errorCode}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{item.attempts}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <p>Source {formatBytes(item.source.sizeBytes)}</p>
                      <p>Consent {formatBytes(item.consent.sizeBytes)}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      <p>{formatDate(item.updatedAt)}</p>
                      <p>Created {formatDate(item.createdAt)}</p>
                    </td>
                    <td className="max-w-[260px] px-3 py-3 text-xs text-muted-foreground">
                      {item.retry.reason}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        {item.canLinkExisting ? (
                          <button
                            type="button"
                            onClick={() => {
                              setLinkingRequest(item);
                              setAvatarId("");
                              setError(null);
                            }}
                            disabled={acting}
                            title="Link a completed presenter"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          >
                            <Link2 className="h-4 w-4" />
                          </button>
                        ) : null}
                        {item.retry.allowed ? (
                          <button
                            type="button"
                            onClick={() => void runAction(item, "retry")}
                            disabled={acting}
                            title={item.retry.maySpend ? "Retry (may spend)" : "Retry safely"}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          >
                            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          </button>
                        ) : null}
                        {item.canCleanup ? (
                          <button
                            type="button"
                            onClick={() => void runAction(item, "cleanup")}
                            disabled={acting}
                            title="Delete private footage"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                        {item.canRemove ? (
                          <button
                            type="button"
                            onClick={() => void runAction(item, "remove")}
                            disabled={acting}
                            title="Remove request"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 text-red-500 transition hover:bg-red-500/10 disabled:opacity-40"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!requests.length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center text-muted-foreground">
                    No presenter requests found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => void load(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {linkingRequest ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-presenter-title"
        >
          <div className="w-full max-w-md rounded-md border border-border bg-background p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="link-presenter-title" className="text-base font-semibold">
                  Link completed presenter
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Verify the completed presenter in the account catalog, then enter its ID.
                  AlphoGen will publish it to {linkingRequest.userEmail}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLinkingRequest(null)}
                disabled={actingId === linkingRequest.id}
                title="Close"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 block text-sm font-medium" htmlFor="completed-presenter-id">
              Completed presenter ID
            </label>
            <input
              id="completed-presenter-id"
              value={avatarId}
              onChange={(event) => setAvatarId(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              autoFocus
              placeholder="445593"
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The ID is verified against the completed account catalog before anything is saved.
              Private source and consent footage are deleted only after the link succeeds.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLinkingRequest(null)}
                disabled={actingId === linkingRequest.id}
                className="h-9 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void linkExistingPresenter()}
                disabled={!avatarId.trim() || actingId === linkingRequest.id}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
              >
                {actingId === linkingRequest.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Link presenter
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
