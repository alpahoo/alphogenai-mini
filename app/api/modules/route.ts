import { NextResponse } from "next/server";
import { getModuleStates } from "@/lib/parallax-modules";

export async function GET() {
  return NextResponse.json({ modules: await getModuleStates() }, { headers: { "Cache-Control": "no-store" } });
}

