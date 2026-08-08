import type { ReactNode } from "react";

/**
 * A helpful "nothing here yet" state, not a bare "No data found." string —
 * give the visitor a reason and, where there is one, a way out.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-dashed border-border-default px-6 py-16 text-center ${className ?? ""}`}>
      {icon && <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-text-tertiary">{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
