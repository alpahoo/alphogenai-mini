export const dynamic = 'force-dynamic';

import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function Navbar() {
  const cookieStore = await cookies();
  // We support both env names to be compatible with older templates and newer docs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {}
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav
      className="w-full flex justify-center border-b border-b-foreground/10 h-16"
      aria-label="Global"
    >
      <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
        <div className="flex gap-5 items-center font-semibold">
          <Link
            href="/"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Accueil
          </Link>
          {user ? (
            <>
              <Link
                href="/notes"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Notes
              </Link>
              <Link
                href="/uploads"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Uploads
              </Link>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <LogoutButton />
          ) : (
            <Link
              href="/auth/login"
              className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}

