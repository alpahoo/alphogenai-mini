/**
 * JobCostBadge — internal cost tracking display (admin-only).
 *
 * Renders engine_used + estimated_cost_usd in a discreet, non-intrusive way.
 * Returns null if engine is missing (legacy job).
 */

interface JobCostBadgeProps {
  engine: string | null;
  cost: number | string | null;
}

export function JobCostBadge({ engine, cost }: JobCostBadgeProps) {
  if (!engine) return null;

  // cost may come as string from numeric DB column
  const costNum = cost === null || cost === undefined ? null : Number(cost);
  const costValid = costNum !== null && Number.isFinite(costNum);

  return (
    <div
      data-testid="admin-job-cost-info"
      className="text-[11px] text-muted-foreground/60 mt-1"
    >
      Engine: <span className="font-medium">{engine}</span>
      {costValid && (
        <>
          {" • "}Cost: <span className="font-medium">${costNum!.toFixed(4)}</span>
        </>
      )}
    </div>
  );
}
