export function ErrorState({
  title,
  description,
  retry,
  className,
}: {
  title: string;
  description?: string;
  retry?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-card border border-error/30 bg-error/5 px-6 py-10 text-center ${className ?? ""}`}
    >
      <p className="text-sm font-medium text-error">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">{description}</p>}
      {retry && (
        <button
          type="button"
          onClick={retry.onClick}
          className="mt-4 rounded-btn border border-error/40 px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error/10"
        >
          {retry.label}
        </button>
      )}
    </div>
  );
}
