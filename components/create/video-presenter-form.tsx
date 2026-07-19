"use client";

import { useState } from "react";
import { Film, Loader2, ShieldCheck, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  VIDEO_PRESENTER_BUCKET,
  VIDEO_PRESENTER_CONSENT,
  validateVideoUpload,
} from "@/lib/video-presenters";

export type PublicVideoPresenterRequest = {
  id: string;
  name: string;
  status: string;
  presenterId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type PreparedUpload = { path: string; token: string };

export function VideoPresenterForm({
  onQueued,
  onCancel,
}: {
  onQueued: (request: PublicVideoPresenterRequest) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [source, setSource] = useState<File | null>(null);
  const [consentFile, setConsentFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadSigned(file: File, upload: PreparedUpload) {
    const supabase = createClient();
    const result = await supabase.storage
      .from(VIDEO_PRESENTER_BUCKET)
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: file.type,
        upsert: false,
      });
    if (result.error) throw new Error("The private video upload failed. Please try again.");
  }

  async function submit() {
    if (!source || !consentFile || !confirmed || !name.trim()) return;
    const sourceError = validateVideoUpload(source, "source");
    const consentError = validateVideoUpload(consentFile, "consent");
    if (sourceError || consentError) {
      setError(sourceError ?? consentError);
      return;
    }
    setBusy(true);
    setError(null);
    setProgress(5);
    let preparedRequestId: string | null = null;
    let token = "";
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in to add a video presenter.");
      token = session.access_token;
      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };
      const prepareResponse = await fetch("/api/presenters/video", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "prepare",
          name: name.trim(),
          consent: true,
          source: { type: source.type, size: source.size },
          consentFile: { type: consentFile.type, size: consentFile.size },
        }),
      });
      const prepared = await prepareResponse.json().catch(() => ({}));
      if (!prepareResponse.ok) throw new Error(prepared.error || "Could not prepare the upload.");
      preparedRequestId = prepared.request.id as string;
      setProgress(15);
      await uploadSigned(source, prepared.uploads.source as PreparedUpload);
      setProgress(65);
      await uploadSigned(consentFile, prepared.uploads.consent as PreparedUpload);
      setProgress(90);
      const submitResponse = await fetch("/api/presenters/video", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "submit", requestId: prepared.request.id }),
      });
      const submitted = await submitResponse.json().catch(() => ({}));
      if (!submitResponse.ok) throw new Error(submitted.error || "Could not queue the presenter.");
      setProgress(100);
      onQueued(submitted.request as PublicVideoPresenterRequest);
    } catch (submitError) {
      if (preparedRequestId && token) {
        await fetch("/api/presenters/video", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "cancel", requestId: preparedRequestId }),
        }).catch(() => undefined);
      }
      setError(submitError instanceof Error ? submitError.message : "Could not submit the presenter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-950">
        <div className="flex gap-3">
          <Film className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <p className="font-bold">Best likeness: recorded video presenter</p>
            <p className="mt-1 text-xs leading-relaxed text-blue-800">
              Upload steady, well-lit footage looking toward the camera, plus a short consent clip.
              Processing is asynchronous; the finished presenter will appear here automatically.
            </p>
          </div>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold text-neutral-800">
        Presenter name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
          maxLength={120}
          placeholder="e.g. My video presenter"
          className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 disabled:bg-neutral-50"
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <VideoFileField
          label="Performance footage"
          hint="Clear, steady speaking footage"
          file={source}
          disabled={busy}
          onChange={(file) => { setSource(file); setError(null); }}
        />
        <VideoFileField
          label="Consent clip"
          hint="Short clip confirming permission"
          file={consentFile}
          disabled={busy}
          onChange={(file) => { setConsentFile(file); setError(null); }}
        />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-neutral-50 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <label className="flex cursor-pointer gap-2 text-xs leading-relaxed text-neutral-600">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy}
            className="mt-0.5 h-4 w-4"
          />
          <span>{VIDEO_PRESENTER_CONSENT}</span>
        </label>
      </div>

      {busy && (
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-neutral-500">Uploading privately... {progress}%</p>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !source || !consentFile || !confirmed}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading..." : "Submit video presenter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
      <p className="mt-3 text-center text-[11px] text-neutral-500">
        Private beta: processing may require several minutes. Your files are not public.
      </p>
    </div>
  );
}

function VideoFileField({
  label,
  hint,
  file,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block cursor-pointer rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 transition hover:border-blue-400">
      <span className="flex items-center gap-2 text-xs font-bold text-neutral-800">
        <Upload className="h-4 w-4 text-blue-600" /> {label}
      </span>
      <span className="mt-1 block truncate text-xs text-neutral-500">{file ? file.name : hint}</span>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </label>
  );
}
