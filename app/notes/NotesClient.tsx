"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Note = { id: string; title: string; created_at: string };

export function NotesClient({ initialNotes }: { initialNotes: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const res = await fetch("/api/notes/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      const json = await res.json();
      const created: Note = json.note;
      setNotes((prev) => [created, ...prev]);
      setTitle("");
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch("/api/notes/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          name="title"
          placeholder="New note title"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          disabled={isPending}
        />
        <Button type="submit" disabled={isPending}>
          Add
        </Button>
      </form>

      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex items-center justify-between rounded-md border p-3"
          >
            <span className="truncate">{note.title}</span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(note.id)}
              disabled={isPending}
            >
              Delete
            </Button>
          </li>
        ))}
        {notes.length === 0 && (
          <li className="text-sm text-muted-foreground">No notes yet.</li>
        )}
      </ul>
    </div>
  );
}

