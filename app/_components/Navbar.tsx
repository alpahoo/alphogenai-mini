import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { cookies } from "next/headers";
import { createServerComponentClient as createClient } from "@supabase/auth-helpers-nextjs";

export default async function Navbar() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let user: unknown = null;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient({ cookies, supabaseUrl, supabaseKey });
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    user = u;
  }

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
              {/* Optionnel: décommentez si la route existe */}
              {false && (
                <Link
                  href="/uploads"
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Uploads
                </Link>
              )}
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

