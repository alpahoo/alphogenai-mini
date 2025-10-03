"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StoredFile = {
  name: string;
  id: string;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  size: number | null;
  metadata: Record<string, unknown> | null;
};

// Minimal shape we rely on from Supabase Storage list() results
type FileListItem = {
  name: string;
  id?: string;
  updated_at?: string | null;
  created_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: { size?: number } | Record<string, unknown> | null;
};

const BUCKET = "uploads";

export default function UploadsClient() {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from(BUCKET).list(undefined, {
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });
    if (!error && data) {
      // The list API returns minimal info; map to our type with defaults
      const typed = data as unknown as FileListItem[];
      setFiles(
        typed.map((f) => ({
          name: f.name,
          id: f.id ?? f.name,
          updated_at: f.updated_at ?? null,
          created_at: f.created_at ?? null,
          last_accessed_at: f.last_accessed_at ?? null,
          size: (f.metadata as { size?: number } | undefined)?.size ?? null,
          metadata: f.metadata ?? null,
        })),
      );
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setProgress(0);

      // Use direct storage endpoint with user's access token so RLS/auth applies.
      // Note: supabase-js upload doesn't expose progress; XHR provides progress events.
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(file.name)}`;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open("POST", url, true);
      if (accessToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
      }
      xhr.setRequestHeader("x-upsert", "true");
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setProgress(pct);
        } else {
          setProgress(null); // indeterminate
        }
      };
      xhr.onload = async () => {
        setUploading(false);
        setProgress(null);
        await refresh();
      };
      xhr.onerror = () => {
        setUploading(false);
        setProgress(null);
      };
      xhr.send(file);
    },
    [refresh, supabase],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      await supabase.storage.from(BUCKET).remove([name]);
      await refresh();
    },
    [supabase, refresh],
  );

  const handleDownload = useCallback(
    async (name: string) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(name, 60);
      if (!error && data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    },
    [supabase],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Input type="file" onChange={handleUpload} disabled={uploading} />
        <Button disabled={uploading} onClick={() => refresh()} variant="secondary">
          Refresh
        </Button>
      </div>
      {uploading ? (
        <div className="text-sm text-foreground/80">
          Uploading... {progress !== null ? `${progress}%` : "(in progress)"}
        </div>
      ) : null}

      <div className="border rounded-md">
        <div className="p-3 border-b text-sm font-semibold flex justify-between">
          <span>Files</span>
          <span>{loading ? "Loading..." : `${files.length}`}</span>
        </div>
        <ul className="divide-y">
          {files.map((f) => (
            <li key={f.id} className="p-3 flex items-center gap-3 justify-between">
              <div className="flex-1 truncate">{f.name}</div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleDownload(f.name)}>
                  Download
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(f.name)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
          {files.length === 0 && !loading ? (
            <li className="p-3 text-sm text-foreground/70">No files</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

