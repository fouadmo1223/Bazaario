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
      <label htmlFor={name} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <input
        id={name}
        name={name}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60"
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
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
        {message}
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      {state.error.message}
    </div>
  );
}

export function fieldError(state: ApiResult<unknown> | null, field: string): string | undefined {
  if (!state || state.ok) return undefined;
  const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
  return details?.fieldErrors?.[field]?.[0];
}
