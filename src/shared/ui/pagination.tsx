import { Link } from "@/i18n/navigation";

/**
 * Server-driven pagination — `hrefFor` builds the link for a given page so
 * the caller keeps ownership of which query params survive the navigation.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  labels,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  labels: { prev: string; next: string; pageOf: (page: number, totalPages: number) => string };
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between ${className ?? ""}`}>
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className="text-sm font-medium text-brand hover:underline">
          {labels.prev}
        </Link>
      ) : (
        <span className="text-sm text-text-tertiary">{labels.prev}</span>
      )}
      <span className="text-sm text-text-secondary">{labels.pageOf(page, totalPages)}</span>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className="text-sm font-medium text-brand hover:underline">
          {labels.next}
        </Link>
      ) : (
        <span className="text-sm text-text-tertiary">{labels.next}</span>
      )}
    </nav>
  );
}
