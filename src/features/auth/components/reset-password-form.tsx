"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import type { ApiResult } from "@/shared/lib/api-response";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ApiResult<null> | null, FormData>(
    resetPasswordAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <ResultBanner state={state} />
        <Link
          href="/login"
          className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" type="password" autoComplete="new-password" required
        error={fieldError(state, "password")} />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        At least 8 characters with upper, lower, and a number.
      </p>
      <SubmitButton>Update password</SubmitButton>
    </form>
  );
}
