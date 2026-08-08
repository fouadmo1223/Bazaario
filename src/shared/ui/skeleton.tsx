export function Skeleton({
  variant = "block",
  className,
}: {
  variant?: "text" | "block" | "circle";
  className?: string;
}) {
  const shape = variant === "circle" ? "rounded-full" : variant === "text" ? "rounded-sm h-4" : "rounded-card";
  return <div className={`animate-pulse bg-border-subtle ${shape} ${className ?? ""}`} aria-hidden />;
}
