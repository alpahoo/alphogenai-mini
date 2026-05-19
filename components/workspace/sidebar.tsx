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
  Shield,
  BarChart3,
  Gift,
  Clapperboard,
  CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { isAdminEmail } from "@/lib/flags";
import { useRouter } from "next/navigation";
import { QuotaBar } from "./quota-bar";

// ---------------------------------------------------------------------------
// Navigation config
// ---------------------------------------------------------------------------
const MAIN_NAV = [
  {
    href: "/home",
    label: "Home",
    icon: Home,
    description: "Dashboard",
  },
  {
    href: "/create",
    label: "Create",
    icon: Plus,
    description: "New video",
  },
  {
    href: "/create/editor",
    label: "Scene Editor",
    icon: Clapperboard,
    description: "Storyboard",
  },
] as const;

const MANAGE_NAV = [
  {
    href: "/projects",
    label: "My Projects",
    icon: FolderOpen,
    description: "History",
  },
  {
    href: "/schedule",
    label: "Schedule",
    icon: CalendarClock,
    description: "Planned posts",
  },
  {
    href: "/library",
    label: "Library",
    icon: Library,
    description: "Assets",
  },
] as const;

const BOTTOM_NAV = [
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    description: "Usage stats",
  },
  {
    href: "/referral",
    label: "Refer & Earn",
    icon: Gift,
    description: "Invite friends",
  },
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
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

  const renderNavItem = (item: { href: string; label: string; icon: typeof Home; description: string }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-150",
          isActive
            ? "bg-primary/10 text-primary shadow-sm"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            isActive
              ? "bg-primary/15 text-primary"
              : "bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground"
          )}
        >
          <item.icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block leading-tight">{item.label}</span>
          <span className="block text-[11px] font-normal text-muted-foreground/70 leading-tight">
            {item.description}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-[hsl(var(--sidebar-bg))] border-[hsl(var(--sidebar-border))]">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-[hsl(var(--sidebar-border))] px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <span className="text-base font-bold tracking-tight">AlphoGen</span>
          {plan === "pro" && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-2 py-0.5 text-[10px] font-bold text-white">
              PRO
            </span>
          )}
          {plan === "premium" && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">
              PREMIUM
            </span>
          )}
        </div>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Create section */}
        <div className="space-y-1">
          {MAIN_NAV.map(renderNavItem)}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[hsl(var(--sidebar-border))]" />

        {/* Manage section */}
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Manage
        </p>
        <div className="space-y-1">
          {MANAGE_NAV.map(renderNavItem)}
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-[hsl(var(--sidebar-border))]" />

        {/* More section */}
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          More
        </p>
        <div className="space-y-1">
          {BOTTOM_NAV.map(renderNavItem)}
        </div>
      </nav>

      {/* Quota */}
      <div className="border-t border-[hsl(var(--sidebar-border))]">
        <QuotaBar />
      </div>

      {/* Footer */}
      <div className="border-t border-[hsl(var(--sidebar-border))] p-3 space-y-2">
        {isAdminEmail(email) && (
          <Link
            href="/admin"
            className="flex items-center gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10"
          >
            <Shield className="h-5 w-5" />
            Admin Panel
          </Link>
        )}

        {plan !== "pro" && plan !== "premium" && (
          <Link
            href="/pricing"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:brightness-110 hover:shadow-primary/30"
          >
            <Crown className="h-5 w-5" />
            Upgrade to Pro
          </Link>
        )}

        {/* User */}
        <div className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/50 transition-colors">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
            {email ? email[0].toUpperCase() : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">
              {email ?? "Account"}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
