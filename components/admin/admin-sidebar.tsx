"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Users, Film, ArrowLeft, Shield } from "lucide-react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/jobs", label: "Jobs", icon: Film },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-border/40 bg-card/30 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-5">
        <Shield className="h-5 w-5 text-red-400" />
        <span className="text-sm font-bold tracking-tight">Admin Panel</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/40 px-4 py-4 space-y-3">
        <Link
          href="/home"
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to workspace
        </Link>
        <p className="text-[10px] text-muted-foreground/50 truncate">{email}</p>
      </div>
    </aside>
  );
}
