export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "info";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-text-secondary border border-border-subtle",
  brand: "bg-brand/10 text-brand",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-info/10 text-info",
};

const SIZE = {
  sm: "px-2 py-0.5 text-[11px]",
  md: "px-2.5 py-1 text-xs",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: keyof typeof SIZE;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${TONE[tone]} ${SIZE[size]} ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
