/**
 * A grouped-content container — for genuine grouping (a KPI figure, a form
 * section, a panel of related fields), not a default wrapper every section
 * needs. Most page sections should NOT be a Card.
 */
export function Card({
  variant = "bordered",
  className,
  children,
}: {
  variant?: "bordered" | "flat";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-card bg-surface transition ${
        variant === "bordered" ? "border border-border-subtle hover:border-border-default" : ""
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`border-b border-border-subtle px-5 py-4 ${className ?? ""}`}>{children}</div>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`px-5 py-4 ${className ?? ""}`}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={`border-t border-border-subtle px-5 py-4 ${className ?? ""}`}>{children}</div>;
}
