import type { ReactNode } from "react";
import { Skeleton } from "./skeleton";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { Pagination } from "./pagination";

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`overflow-x-auto rounded-card border border-border-subtle ${className ?? ""}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border-subtle bg-surface-raised text-start">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 text-start text-xs font-medium text-text-secondary ${className ?? ""}`}>
      {children}
    </th>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <tr className={`border-b border-border-subtle transition last:border-0 hover:bg-surface-raised ${className ?? ""}`}>
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

/**
 * A full table shell handling the four states every dashboard list needs —
 * loading/empty/error/rows-with-pagination — so each feature stops
 * reimplementing the same branch.
 */
export function DataTable<T>({
  items,
  loading,
  error,
  columns,
  renderRow,
  rowKey,
  empty,
  pagination,
}: {
  items: T[];
  loading?: boolean;
  error?: { title: string; description?: string; retry?: () => void } | null;
  columns: ReactNode;
  renderRow: (item: T) => ReactNode;
  rowKey: (item: T) => string;
  empty: { title: string; description?: string; action?: ReactNode };
  pagination?: {
    page: number;
    totalPages: number;
    hrefFor: (page: number) => string;
    labels: { prev: string; next: string; pageOf: (page: number, totalPages: number) => string };
  };
}) {
  if (error) {
    return (
      <ErrorState
        title={error.title}
        description={error.description}
        retry={error.retry ? { label: "Retry", onClick: error.retry } : undefined}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} action={empty.action} />;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHead>{columns}</TableHead>
        <TableBody>
          {items.map((item) => (
            <Tr key={rowKey(item)}>{renderRow(item)}</Tr>
          ))}
        </TableBody>
      </Table>
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
