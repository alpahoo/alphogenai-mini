import { updateSession } from "@/lib/supabase/middleware";
import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Basic auth for admin UI (MVP). Uses ADMIN_PASSWORD or falls back to ADMIN_TOKEN.
  if (pathname.startsWith("/admin")) {
    const auth = request.headers.get("authorization");
    const expectedPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_TOKEN;
    if (!expectedPass) {
      // No password set → deny access by default
      return new NextResponse("Admin disabled", {
        status: 403,
      });
    }

    if (!auth?.startsWith("Basic ")) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
      });
    }
    try {
      const [, b64] = auth.split(" ");
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const password = decoded.split(":").slice(1).join(":");
      if (password !== expectedPass) {
        return new NextResponse("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
        });
      }
    } catch {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
      });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
