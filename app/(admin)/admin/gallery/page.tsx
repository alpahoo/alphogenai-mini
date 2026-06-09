"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { cleanModelName } from "@/lib/engine-intentions";

type GalleryStatus = "draft" | "published" | "hidden";
type GalleryCategory = "cinematic" | "ugc" | "product" | "avatar" | "story" | "social";

type GalleryItem = {
  id: string;
  source_job_id: string | null;
  media_type: "video" | "image";
  status: GalleryStatus;
  title: string;
  subtitle: string | null;
  public_prompt: string | null;
  category: GalleryCategory;
  media_url: string;
  thumbnail_url: string | null;
  aspect_ratio: string | null;
  duration_seconds: number | null;
  display_model: string | null;
  sort_order: number;
  featured: boolean;
  created_at: string;
  published_at: string | null;
};

const STATUS_OPTIONS: Array<{ value: GalleryStatus | ""; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

const CATEGORY_OPTIONS: Array<{ value: GalleryCategory | ""; label: string }> = [
  { value: "", label: "All categories" },
  { value: "cinematic", label: "Cinematic" },
  { value: "ugc", label: "UGC" },
  { value: "product", label: "Product" },
  { value: "avatar", label: "Avatar" },
  { value: "story", label: "Story" },
  { value: "social", label: "Social" },
];

const STATUS_STYLES: Record<GalleryStatus, string> = {
  draft: "border-zinc-300 bg-zinc-100 text-zinc-700",
  hidden: "border-amber-300 bg-amber-50 text-amber-700",
  published: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

function emptyCreateForm() {
  return {
    title: "",
    media_url: "",
    subtitle: "",
    category: "cinematic" as GalleryCategory,
  };
}

export default function AdminGalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GalleryStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<GalleryCategory | "">("");
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [jobId, setJobId] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    return params.toString();
  }, [categoryFilter, statusFilter]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/gallery${queryString ? `?${queryString}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load gallery items");
      setItems(data.items ?? []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load gallery items");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function createItem() {
    setSavingId("create");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create gallery item");
      setCreateForm(emptyCreateForm());
      setMessage("Gallery draft created.");
      await fetchItems();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create gallery item");
    } finally {
      setSavingId(null);
    }
  }

  async function createFromJob() {
    setSavingId("from-job");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/gallery/from-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create draft from job");
      setJobId("");
      setMessage("Privacy-safe draft created from job.");
      await fetchItems();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create draft from job");
    } finally {
      setSavingId(null);
    }
  }

  async function patchItem(id: string, values: Record<string, unknown>) {
    setSavingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/gallery/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update gallery item");
      setItems((current) => current.map((item) => (item.id === id ? data.item : item)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update gallery item");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Remove this item from the gallery? The source job will not be deleted.")) {
      return;
    }
    setSavingId(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/gallery/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete gallery item");
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to delete gallery item");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gallery</h1>
          <p className="text-sm text-muted-foreground">
            Curate exactly what appears publicly. Jobs stay private unless published here.
          </p>
        </div>
        <button
          onClick={fetchItems}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm hover:bg-muted/40"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {message ? (
        <div className="rounded-lg border border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border/40 bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold">Create gallery draft</h2>
          <div className="grid gap-3">
            <input
              value={createForm.title}
              onChange={(e) => setCreateForm((form) => ({ ...form, title: e.target.value }))}
              placeholder="Public title"
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              value={createForm.subtitle}
              onChange={(e) => setCreateForm((form) => ({ ...form, subtitle: e.target.value }))}
              placeholder="Public subtitle"
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <input
              value={createForm.media_url}
              onChange={(e) => setCreateForm((form) => ({ ...form, media_url: e.target.value }))}
              placeholder="Public media URL"
              className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <div className="flex gap-2">
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((form) => ({ ...form, category: e.target.value as GalleryCategory }))}
                className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              >
                {CATEGORY_OPTIONS.filter((option) => option.value).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={createItem}
                disabled={savingId === "create"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
              >
                {savingId === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border/40 bg-card/60 p-4">
          <h2 className="mb-3 text-sm font-semibold">Draft from finished job</h2>
          <p className="mb-3 text-xs leading-5 text-muted-foreground">
            Creates a draft only. Raw private prompts are never copied into public copy.
          </p>
          <div className="flex gap-2">
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Job ID"
              className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
            <button
              onClick={createFromJob}
              disabled={savingId === "from-job"}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/50 px-4 py-2 text-sm font-semibold hover:bg-muted/40 disabled:opacity-50"
            >
              {savingId === "from-job" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </div>
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as GalleryStatus | "")}
          className="rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as GalleryCategory | "")}
          className="rounded-lg border border-border bg-background/50 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border/40 bg-card/60 p-4">
              <div className="grid gap-4 lg:grid-cols-[180px_1fr_auto]">
                <div className="aspect-video overflow-hidden rounded-lg bg-muted/30">
                  {item.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                  ) : item.media_type === "video" ? (
                    <video src={item.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.media_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>

                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[item.status]}`}>
                      {item.status}
                    </span>
                    <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      {item.category}
                    </span>
                    {item.featured ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Star className="h-3 w-3" />
                        Featured
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      defaultValue={item.title}
                      onBlur={(e) => e.target.value !== item.title && patchItem(item.id, { title: e.target.value })}
                      className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none"
                    />
                    <input
                      defaultValue={item.subtitle ?? ""}
                      onBlur={(e) => e.target.value !== (item.subtitle ?? "") && patchItem(item.id, { subtitle: e.target.value })}
                      placeholder="Public subtitle"
                      className="rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                  </div>

                  <textarea
                    defaultValue={item.public_prompt ?? ""}
                    onBlur={(e) => e.target.value !== (item.public_prompt ?? "") && patchItem(item.id, { public_prompt: e.target.value })}
                    placeholder="Public prompt or editorial note"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none"
                  />

                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>ID: {item.id.slice(0, 8)}</span>
                    {item.source_job_id ? <span>Source job: {item.source_job_id.slice(0, 8)}</span> : null}
                    {item.display_model ? <span>Model: {cleanModelName(item.display_model)}</span> : null}
                  </div>
                </div>

                <div className="flex flex-row gap-2 lg:flex-col">
                  <button
                    onClick={() => patchItem(item.id, { status: item.status === "published" ? "draft" : "published" })}
                    disabled={savingId === item.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
                  >
                    {item.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {item.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => patchItem(item.id, { featured: !item.featured })}
                    disabled={savingId === item.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
                  >
                    <Star className="h-4 w-4" />
                    {item.featured ? "Unfeature" : "Feature"}
                  </button>
                  <button
                    onClick={() => patchItem(item.id, { status: "hidden" })}
                    disabled={savingId === item.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    Hide
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    disabled={savingId === item.id}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 py-16 text-center text-sm text-muted-foreground">
              No gallery items yet.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
