"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderOpen,
  Sparkles,
  Crown,
  LogOut,
  Plus,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/create", label: "Create", icon: Plus },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/library", label: "Library", icon: Library },
] as const;

interface SidebarProps {
  plan: string;
  email: string | null;
}

export function Sidebar({ plan, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border/50 bg-card/50 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border/50 px-5">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="text-sm font-bold tracking-tight">AlphoGenAI</span>
        {plan === "pro" && (
          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            PRO
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border/50 p-3 space-y-2">
        {plan !== "pro" && (
          <Link
            href="/pricing"
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-2 text-sm font-semibold text-white transition-all hover:brightness-110"
          >
            <Crown className="h-4 w-4" />
            Upgrade to Pro
          </Link>
        )}

        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {email ?? "Account"}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
