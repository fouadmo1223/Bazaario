"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { registerAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import { Reveal } from "@/shared/components/reveal";
import type { ApiResult } from "@/shared/lib/api-response";
import type { PublicUser } from "@/server/services/auth.service";

export function RegisterForm() {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<ApiResult<PublicUser> | null, FormData>(
    registerAction,
    null,
  );

  // On success we keep the user on the page showing the "check your email" banner.
  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <Reveal immediate stagger className="space-y-4">
        <Field label={t("fullName")} name="name" autoComplete="name" required
          error={fieldError(state, "name")} />
        <Field label={t("email")} name="email" type="email" autoComplete="email" required
          error={fieldError(state, "email")} />
        <Field label={t("password")} name="password" type="password" autoComplete="new-password" required
          error={fieldError(state, "password")} />
        <p className="text-xs text-text-tertiary">{t("passwordHint")}</p>
        <SubmitButton>{t("createAccountBtn")}</SubmitButton>
      </Reveal>
    </form>
  );
}
