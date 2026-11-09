"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/flags";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { useStudioDark } from "@/lib/studio/theme";
import { Loader2, Menu, X } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  // The Studio is a full-bleed app surface; other admin pages keep their padding.
  const fullBleed = pathname?.startsWith("/admin/studio") ?? false;
  useEffect(() => setMenuOpen(false), [pathname]);
  const [studioDark] = useStudioDark();

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email || !isAdminEmail(user.email)) {
        router.replace("/home");
        return;
      }

      setEmail(user.email);
      setReady(true);
    })();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={fullBleed && studioDark ? "dark flex min-h-screen bg-background text-foreground" : "flex min-h-screen"}>
      <div className="hidden md:block">
        <AdminSidebar email={email} />
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />
          <div className="relative h-full w-56 bg-background">
            <AdminSidebar email={email} />
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute left-[13.5rem] top-3 z-50 grid h-8 w-8 place-items-center rounded-lg bg-background/90 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <main className={fullBleed ? "flex h-[100dvh] min-w-0 flex-1 flex-col md:ml-56" : "min-w-0 flex-1 p-4 pt-16 md:ml-56 md:p-8"}>
        <div className={fullBleed ? "flex h-11 shrink-0 items-center border-b border-border/40 px-3 md:hidden" : "fixed left-3 top-3 z-30 md:hidden"}>
          <button type="button" aria-label="Open admin menu" onClick={() => setMenuOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-border/50 bg-background/90 text-muted-foreground">
            <Menu className="h-4 w-4" />
          </button>
        </div>
        {fullBleed ? <div className="min-h-0 flex-1">{children}</div> : children}
      </main>
    </div>
  );
}
