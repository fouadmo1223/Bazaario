"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { forgotPasswordAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import type { ApiResult } from "@/shared/lib/api-response";

export function ForgotPasswordForm() {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<ApiResult<null> | null, FormData>(
    forgotPasswordAction,
    null,
  );
  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" required
        error={fieldError(state, "email")} />
      <SubmitButton>{t("sendResetLink")}</SubmitButton>
    </form>
  );
}
