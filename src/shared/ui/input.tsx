import { useId, type ComponentProps } from "react";

type FieldChrome = {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
};

const FIELD =
  "w-full rounded-btn border border-border-default bg-surface px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-text-tertiary focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60";

function FieldWrapper({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: FieldChrome & Omit<ComponentProps<"input">, "className" | "id"> & { id?: string }) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  return (
    <FieldWrapper id={fieldId} label={label} hint={hint} error={error}>
      <input
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        className={`${FIELD} ${error ? "border-error focus:border-error focus:ring-error/20" : ""} ${className ?? ""}`}
        {...rest}
      />
    </FieldWrapper>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  id,
  ...rest
}: FieldChrome & Omit<ComponentProps<"textarea">, "className" | "id"> & { id?: string }) {
  const reactId = useId();
  const fieldId = id ?? reactId;
  return (
    <FieldWrapper id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        className={`${FIELD} ${error ? "border-error focus:border-error focus:ring-error/20" : ""} ${className ?? ""}`}
        {...rest}
      />
    </FieldWrapper>
  );
}
