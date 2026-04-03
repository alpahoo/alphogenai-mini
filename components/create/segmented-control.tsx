"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentOption {
  value: string;
  label: string;
  disabled?: boolean;
  locked?: boolean;
  hint?: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-border/50 bg-muted/50 p-1",
        className
      )}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        const isDisabled = option.disabled || option.locked;

        return (
          <button
            key={option.value}
            type="button"
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(option.value)}
            className={cn(
              "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150",
              isActive && !isDisabled
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
              isDisabled
                ? "cursor-not-allowed opacity-50"
                : "hover:text-foreground"
            )}
            title={option.hint}
          >
            {option.label}
            {option.locked && <Lock className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}
