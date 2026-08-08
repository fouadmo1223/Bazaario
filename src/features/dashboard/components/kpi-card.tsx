import type { ReactNode } from "react";

/** Compact KPI tile used across the vendor dashboard and platform console. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-5 transition hover:border-border-default hover:shadow-xs">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        {icon && <span className="text-text-tertiary">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-text-tertiary">{hint}</p>}
    </div>
  );
}
