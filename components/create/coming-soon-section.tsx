"use client";

import { cn } from "@/lib/utils";

interface ComingSoonSectionProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps a disabled feature section with a "Coming soon" indicator.
 * Content is rendered but visually muted and non-interactive.
 */
export function ComingSoonSection({
  label,
  children,
  className,
}: ComingSoonSectionProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground/60">
          {label}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Coming soon
        </span>
      </div>
      <div className="pointer-events-none select-none opacity-40">
        {children}
      </div>
    </div>
  );
}
