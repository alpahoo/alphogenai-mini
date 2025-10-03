import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { FileObject } from "@supabase/storage-js";

export const runtime = "nodejs";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.storage
    .from("user_uploads")
    .list(user.id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const files: FileObject[] = (data || []) as FileObject[];
  return NextResponse.json(
    files.map((f) => ({
      name: f.name,
      id: (f as { id?: string }).id ?? undefined,
      created_at: (f as { created_at?: string }).created_at ?? null,
      updated_at: (f as { updated_at?: string }).updated_at ?? null,
      last_accessed_at: (f as { last_accessed_at?: string }).last_accessed_at ?? null,
      metadata: f.metadata as Record<string, unknown> | null,
    })),
  );
}

