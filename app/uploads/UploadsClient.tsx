"use client";

import { useCallback, useMemo, useState } from "react";

type FileItem = {
  name: string;
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
  last_accessed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export default function UploadsClient({ initialFiles }: { initialFiles: FileItem[] }) {
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/uploads/list");
    const json = (await res.json()) as FileItem[] | { error: string };
    if (res.ok) setFiles(json as FileItem[]);
  }, []);

  const onSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError("Choisissez un fichier");
      return;
    }
    setIsUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/upload", { method: "POST", body });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await refreshList();
      form.reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsUploading(false);
    }
  }, [refreshList]);

  const onDelete = useCallback(async (name: string) => {
    const res = await fetch("/api/uploads/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Delete failed");
      return;
    }
    await refreshList();
  }, [refreshList]);

  const rows = useMemo(() => files.map((f) => (
    <tr key={f.name} className="border-b">
      <td className="py-2 pr-4 font-medium">{f.name}</td>
      <td className="py-2 pr-4 text-sm text-muted-foreground">
        {typeof f.metadata?.size === "number" ? `${f.metadata.size} B` : "—"}
      </td>
      <td className="py-2 pr-4 text-sm text-muted-foreground">
        {f.created_at ? new Date(f.created_at).toLocaleString() : "—"}
      </td>
      <td className="py-2 text-right">
        <button
          onClick={() => onDelete(f.name)}
          className="px-3 py-1 text-sm border rounded hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Supprimer
        </button>
      </td>
    </tr>
  )), [files, onDelete]);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} className="flex items-center gap-3">
        <input
          type="file"
          name="file"
          className="text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        />
        <button
          type="submit"
          disabled={isUploading}
          className="px-4 py-2 border rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          {isUploading ? "Uploading..." : "Uploader"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Nom</th>
              <th className="text-left py-2 pr-4">Taille</th>
              <th className="text-left py-2 pr-4">Date</th>
              <th className="text-right py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
      </div>
    </div>
  );
}

