import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PremiumEyebrow({
  icon: Icon,
  children,
  className,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white/70 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm",
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </div>
  );
}

export function PremiumSectionHeader({
  eyebrow,
  title,
  body,
  align = "left",
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  tone?: "light" | "dark";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? (
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-[0.24em]",
            tone === "dark" ? "text-lime-300" : "text-[#635bff]",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          "mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl",
          tone === "dark" ? "text-white" : "text-neutral-950",
        )}
      >
        {title}
      </h2>
      {body ? (
        <p
          className={cn(
            "mt-4 text-sm leading-6 sm:text-base",
            tone === "dark" ? "text-white/62" : "text-neutral-600",
          )}
        >
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function PremiumMediaFrame({
  children,
  label,
  meta,
  className,
}: {
  children: ReactNode;
  label?: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-neutral-900/10 bg-neutral-950 text-white shadow-2xl shadow-neutral-950/18",
        className,
      )}
    >
      {(label || meta) ? (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">
          <span>{label}</span>
          <span>{meta}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function PremiumWorkflowCard({
  icon: Icon,
  title,
  body,
  accent = "violet",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  accent?: "violet" | "green" | "amber" | "rose" | "blue" | "lime";
}) {
  const accentClasses = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    lime: "bg-lime-100 text-lime-700",
    rose: "bg-rose-100 text-rose-700",
    violet: "bg-violet-100 text-violet-700",
  }[accent];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className={cn("mb-5 flex h-11 w-11 items-center justify-center rounded-md", accentClasses)}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-neutral-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-600">{body}</p>
    </div>
  );
}

export function PremiumMetricStrip({
  metrics,
  className,
}: {
  metrics: Array<{ label: string; value: string; detail: string }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.06] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{metric.value}</p>
          <p className="mt-1 text-xs leading-5 text-white/55">{metric.detail}</p>
        </div>
      ))}
    </div>
  );
}
