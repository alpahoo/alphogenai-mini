"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Save,
  Key,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  PlayCircle,
  FileText,
} from "lucide-react";
import { ENGINE_TEMPLATES, getTemplate } from "@/lib/engine-templates";

interface Engine {
  id: string;
  name: string;
  type: "api" | "modal_local";
  status: "active" | "coming_soon" | "deprecated";
  max_duration: number;
  gpu: string | null;
  clip_duration: number | null;
  priority: number;
  api_config: Record<string, unknown>;
  plans: string[];
  cost: { billing_model: string; per_second_usd: number | null; per_video_usd: number | null } | null;
  secrets: { name: string; updated_at: string }[];
}

const ALL_PLANS = ["free", "pro", "premium"];

export default function EngineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const isNew = id === "new";

  const [engine, setEngine] = useState<Engine | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiConfigJson, setApiConfigJson] = useState<string>("");
  const [apiConfigError, setApiConfigError] = useState<string | null>(null);

  // Form state for new engine
  const [form, setForm] = useState({
    id: "",
    name: "",
    type: "api" as "api" | "modal_local",
    status: "coming_soon" as "active" | "coming_soon" | "deprecated",
    max_duration: 15,
    gpu: "",
    clip_duration: "",
    priority: 100,
    plans: [] as string[],
    cost_billing_model: "per_second",
    cost_per_second: 0.025,
    cost_per_video: 0.1,
  });

  const fetchEngine = useCallback(() => {
    if (isNew) return;
    setLoading(true);
    fetch(`/api/admin/engines/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.engine) {
          setEngine(d.engine);
          setForm({
            id: d.engine.id,
            name: d.engine.name,
            type: d.engine.type,
            status: d.engine.status,
            max_duration: d.engine.max_duration,
            gpu: d.engine.gpu ?? "",
            clip_duration: d.engine.clip_duration?.toString() ?? "",
            priority: d.engine.priority,
            plans: d.engine.plans,
            cost_billing_model: d.engine.cost?.billing_model ?? "per_second",
            cost_per_second: d.engine.cost?.per_second_usd ?? 0.025,
            cost_per_video: d.engine.cost?.per_video_usd ?? 0.1,
          });
          setApiConfigJson(
            d.engine.api_config && Object.keys(d.engine.api_config).length > 0
              ? JSON.stringify(d.engine.api_config, null, 2)
              : ""
          );
        }
      })
      .finally(() => setLoading(false));
  }, [id, isNew]);

  useEffect(() => {
    fetchEngine();
  }, [fetchEngine]);

  const saveEngine = async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        // Create
        const res = await fetch("/api/admin/engines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: form.id,
            name: form.name,
            type: form.type,
            status: form.status,
            max_duration: form.max_duration,
            gpu: form.gpu || null,
            clip_duration: form.clip_duration ? Number(form.clip_duration) : null,
            priority: form.priority,
            plans: form.plans,
            cost: {
              billing_model: form.cost_billing_model,
              per_second_usd: form.cost_billing_model === "per_second" ? form.cost_per_second : null,
              per_video_usd: form.cost_billing_model === "per_video" ? form.cost_per_video : null,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        router.push(`/admin/engines/${form.id}`);
      } else {
        // Parse api_config JSON
        let apiConfig: object = {};
        if (apiConfigJson.trim()) {
          try {
            apiConfig = JSON.parse(apiConfigJson);
            setApiConfigError(null);
          } catch (e) {
            setApiConfigError(e instanceof Error ? e.message : "Invalid JSON");
            throw new Error("api_config is invalid JSON");
          }
        }

        // Update engine
        await fetch(`/api/admin/engines/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            type: form.type,
            status: form.status,
            max_duration: form.max_duration,
            gpu: form.gpu || null,
            clip_duration: form.clip_duration ? Number(form.clip_duration) : null,
            priority: form.priority,
            api_config: apiConfig,
          }),
        });
        // Update plans
        await fetch(`/api/admin/engines/${id}/plans`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plans: form.plans }),
        });
        // Update cost
        await fetch(`/api/admin/engines/${id}/costs`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            billing_model: form.cost_billing_model,
            per_second_usd: form.cost_billing_model === "per_second" ? form.cost_per_second : null,
            per_video_usd: form.cost_billing_model === "per_video" ? form.cost_per_video : null,
          }),
        });
        fetchEngine();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const togglePlan = (plan: string) => {
    setForm((f) => ({
      ...f,
      plans: f.plans.includes(plan) ? f.plans.filter((p) => p !== plan) : [...f.plans, plan],
    }));
  };

  const addSecret = async () => {
    const name = prompt("Secret name (e.g. 'api_key')?");
    if (!name) return;
    const value = prompt(`Value for '${name}'?`);
    if (!value) return;

    const res = await fetch(`/api/admin/engines/${id}/secrets`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, value }),
    });
    if (res.ok) fetchEngine();
    else alert("Failed to save secret");
  };

  const deleteSecret = async (name: string) => {
    if (!confirm(`Delete secret '${name}'?`)) return;
    await fetch(`/api/admin/engines/${id}/secrets?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    fetchEngine();
  };

  const loadTemplate = (templateId: string) => {
    const tpl = getTemplate(templateId);
    if (!tpl) return;
    if (apiConfigJson && !confirm(`Overwrite current config with "${tpl.label}"?`)) return;
    setApiConfigJson(JSON.stringify(tpl.config, null, 2));
    setApiConfigError(null);
    // Auto-fill suggestions
    setForm((f) => ({
      ...f,
      type: "api",
      max_duration: tpl.defaultMaxDuration,
      cost_billing_model: "per_second",
      cost_per_second: tpl.defaultCostPerSecond,
    }));
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/engines/${id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const deleteEngine = async () => {
    if (!confirm("Deprecate this engine? (soft-delete, status set to 'deprecated')")) return;
    await fetch(`/api/admin/engines/${id}`, { method: "DELETE" });
    router.push("/admin/engines");
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href="/admin/engines"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to engines
        </Link>
        <h1 className="text-2xl font-bold">
          {isNew ? "Add Engine" : engine?.name ?? "Engine"}
        </h1>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Main form */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
        <h2 className="text-sm font-semibold">Configuration</h2>

        {isNew && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              ID (unique, lowercase, no spaces)
            </label>
            <input
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/\s/g, "_") })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
              placeholder="kling_v2"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
              placeholder="Kling 2.0"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "api" | "modal_local" })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            >
              <option value="api">API (external)</option>
              <option value="modal_local">Modal Local (GPU)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "coming_soon" | "deprecated" })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            >
              <option value="coming_soon">Coming Soon</option>
              <option value="active">Active</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max Duration (s)</label>
            <input
              type="number"
              value={form.max_duration}
              onChange={(e) => setForm({ ...form, max_duration: parseInt(e.target.value) || 0 })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
            <input
              type="number"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">Available for plans</label>
          <div className="flex gap-2">
            {ALL_PLANS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlan(p)}
                className={`rounded-md border px-3 py-1 text-xs font-medium capitalize ${
                  form.plans.includes(p)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background/50 text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cost */}
      <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
        <h2 className="text-sm font-semibold">Cost</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Billing model</label>
            <select
              value={form.cost_billing_model}
              onChange={(e) => setForm({ ...form, cost_billing_model: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            >
              <option value="per_second">Per Second</option>
              <option value="per_video">Per Video (flat)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {form.cost_billing_model === "per_second" ? "USD per second" : "USD per video"}
            </label>
            <input
              type="number"
              step="0.001"
              value={form.cost_billing_model === "per_second" ? form.cost_per_second : form.cost_per_video}
              onChange={(e) =>
                setForm({
                  ...form,
                  [form.cost_billing_model === "per_second" ? "cost_per_second" : "cost_per_video"]:
                    parseFloat(e.target.value) || 0,
                })
              }
              className="h-9 w-full rounded-lg border border-border bg-background/50 px-3 text-sm"
            />
          </div>
        </div>
      </div>

      {/* Secrets (only for existing engines) */}
      {!isNew && engine && (
        <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Secrets
            </h2>
            <button
              onClick={addSecret}
              className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-xs hover:bg-muted/40"
            >
              <Plus className="h-3 w-3" />
              Add / Rotate
            </button>
          </div>
          {engine.secrets.length === 0 ? (
            <p className="text-xs text-muted-foreground">No secrets configured</p>
          ) : (
            <div className="space-y-2">
              {engine.secrets.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-md border border-border/30 bg-background/40 px-3 py-2"
                >
                  <div>
                    <div className="font-mono text-xs">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Updated {new Date(s.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteSecret(s.name)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* API Config (JSONB) — only for api-type engines */}
      {!isNew && engine && form.type === "api" && (
        <div className="rounded-xl border border-border/40 bg-card/60 p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">API Config (Generic Adapter)</h2>
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => e.target.value && loadTemplate(e.target.value)}
                defaultValue=""
                className="rounded-md border border-border bg-background/50 px-2 py-1 text-xs"
              >
                <option value="">📋 Load template...</option>
                {ENGINE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button
                onClick={testConnection}
                disabled={testing}
                className="flex items-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1 text-xs hover:bg-muted/40 disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <PlayCircle className="h-3 w-3" />
                )}
                Test Connection
              </button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            JSON config for generic REST adapter. Supports {"{{prompt}}"}, {"{{duration}}"},
            {" {{image_url}}"}, {"{{task_id}}"}, {"{{secrets.name}}"} placeholders.
          </p>
          <textarea
            value={apiConfigJson}
            onChange={(e) => {
              setApiConfigJson(e.target.value);
              setApiConfigError(null);
            }}
            placeholder='{"create_task": {"url": "...", "body": {...}}, "poll_task": {...}}'
            className="h-64 w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-xs font-mono"
            spellCheck={false}
          />
          {apiConfigError && (
            <p className="text-xs text-destructive">JSON error: {apiConfigError}</p>
          )}
          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                testResult.success
                  ? "border-green-500/30 bg-green-500/5 text-green-400"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span>{testResult.message ?? testResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        {!isNew && (
          <button
            onClick={deleteEngine}
            className="flex items-center gap-1 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" />
            Deprecate
          </button>
        )}
        <button
          onClick={saveEngine}
          disabled={saving}
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? "Create Engine" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
