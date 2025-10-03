import React from "react";
import { createClient } from "@/lib/supabase/server";
import { NotesClient } from "./NotesClient";

async function getNotes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [] as Array<{ id: string; title: string; created_at: string }>;
  const { data } = await supabase
    .from("notes")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as Array<{ id: string; title: string; created_at: string }>;
}

export default async function NotesPage() {
  const notes = await getNotes();

  return (
    <div className="mx-auto max-w-xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Notes</h1>
      <NotesClient initialNotes={notes} />
    </div>
  );
}

