"use client";

import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import type { ApiResult } from "@/shared/lib/api-response";

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ApiResult<null> | null, FormData>(
    forgotPasswordAction,
    null,
  );
  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <Field label="Email" name="email" type="email" autoComplete="email" required
        error={fieldError(state, "email")} />
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
