// TEMPORARY debug — inspect avatar_group looks to find the id Avatar Shots
// accepts. Secret-gated. DELETE after use.
import { NextResponse } from "next/server";

const V2 = "https://api.heygen.com/v2";

function hg() {
  return {
    "X-Api-Key": process.env.HEYGEN_API_KEY ?? "",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== "alphogen-dbg-2026") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const out: Record<string, unknown> = {};
  try {
    const ar = await fetch(`${V2}/avatar_group.list?include_public=false`, { headers: hg() });
    const ad = await ar.json();
    const groups: Record<string, unknown>[] = ad.data?.avatar_group_list ?? [];
    const result: Record<string, unknown>[] = [];
    for (const g of groups) {
      const gid = String(g.id ?? "");
      const entry: Record<string, unknown> = {
        groupId: gid,
        name: g.name,
        group_type: g.group_type,
        num_looks: g.num_looks,
        default_voice_id: g.default_voice_id,
      };
      try {
        const lr = await fetch(`${V2}/avatar_group/${gid}/avatars`, { headers: hg() });
        const ld = await lr.json();
        entry.looksStatus = lr.status;
        const looks = ld.data?.avatar_list ?? ld.data?.avatars ?? ld.avatar_list ?? [];
        entry.looksRaw = JSON.stringify(looks).slice(0, 600);
      } catch (e) {
        entry.looksError = e instanceof Error ? e.message : String(e);
      }
      result.push(entry);
    }
    out.groups = result;
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(out);
}
