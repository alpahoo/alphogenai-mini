"use client";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  color?: string;
}

export function StatCard({ label, value, icon: Icon, description, color = "text-primary" }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {description && (
        <p className="text-[11px] text-muted-foreground/60 mt-1">{description}</p>
      )}
    </div>
  );
}
