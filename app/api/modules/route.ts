import { NextResponse } from "next/server";
import { getModuleStates, type ModuleViewer } from "@/lib/parallax-modules";
import { createClient } from "@/lib/supabase/server";

/** Booleans only. A module set to "admin" reads true for an administrator and false for everybody else (and for nobody). */
export async function GET() {
  let viewer: ModuleViewer = null;
  try {
    const { data } = await (await createClient()).auth.getUser();
    viewer = data.user ? { email: data.user.email } : null;
  } catch {
    viewer = null;
  }
  return NextResponse.json({ modules: await getModuleStates(viewer) }, { headers: { "Cache-Control": "no-store" } });
}
