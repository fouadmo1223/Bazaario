"use client";

import { useActionState } from "react";
import { registerAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import type { ApiResult } from "@/shared/lib/api-response";
import type { PublicUser } from "@/server/services/auth.service";

export function RegisterForm() {
  const [state, action] = useActionState<ApiResult<PublicUser> | null, FormData>(
    registerAction,
    null,
  );

  // On success we keep the user on the page showing the "check your email" banner.
  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <Field label="Full name" name="name" autoComplete="name" required
        error={fieldError(state, "name")} />
      <Field label="Email" name="email" type="email" autoComplete="email" required
        error={fieldError(state, "email")} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required
        error={fieldError(state, "password")} />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        At least 8 characters with upper, lower, and a number.
      </p>
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
