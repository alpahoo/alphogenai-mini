import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** Paths inside the (workspace) route group that require auth. */
const WORKSPACE_PATHS = ["/home", "/projects"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only enforce auth for workspace paths
  if (WORKSPACE_PATHS.some((p) => pathname.startsWith(p))) {
    return updateSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
