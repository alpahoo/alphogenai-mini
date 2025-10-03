import { cn } from "@/lib/utils";

export function EmptyState({
  title = "Nothing here",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center border rounded-md p-6 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="font-medium text-foreground mb-1">{title}</div>
      {description ? <div className="max-w-sm">{description}</div> : null}
    </div>
  );
}

