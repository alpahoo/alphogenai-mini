"use client";

const PLAN_STYLES: Record<string, string> = {
  free: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  pro: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  premium: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

export function PlanBadge({ plan }: { plan: string }) {
  const style = PLAN_STYLES[plan] ?? PLAN_STYLES.free;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style}`}
    >
      {plan}
    </span>
  );
}
