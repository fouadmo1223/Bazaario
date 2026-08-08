"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import type { ApiResult } from "@/shared/lib/api-response";

export function Field({
  label,
  name,
  error,
  ...props
}: { label: string; name: string; error?: string } & ComponentProps<"input">) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="w-full rounded-btn border border-border-default bg-surface px-3 py-2 text-sm text-foreground shadow-xs outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

/** Renders the success or error banner for an ApiResult from useActionState. */
export function ResultBanner({ state }: { state: ApiResult<unknown> | null }) {
  if (!state) return null;
  if (state.ok) {
    const message = (state.meta?.message as string) ?? "Success";
    return (
      <div className="mb-4 rounded-btn border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
        {message}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-btn border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
      {state.error.message}
    </div>
  );
}

export function fieldError(state: ApiResult<unknown> | null, field: string): string | undefined {
  if (!state || state.ok) return undefined;
  const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
  return details?.fieldErrors?.[field]?.[0];
}
