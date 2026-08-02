import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/podcast/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await createServiceClient().from("clipping_packs")
    .select("*, clipping_pack_clips(*)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load this clipping project." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Clipping project not found." }, { status: 404 });
  data.clipping_pack_clips = (data.clipping_pack_clips ?? []).sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank);
  return NextResponse.json({ pack: data });
}
