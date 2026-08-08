"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { resetPasswordAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import { Reveal } from "@/shared/components/reveal";
import type { ApiResult } from "@/shared/lib/api-response";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("Auth");
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
          className="flex w-full items-center justify-center rounded-btn bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-sm"
        >
          {t("continueToSignIn")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ResultBanner state={state} />
      <input type="hidden" name="token" value={token} />
      <Reveal immediate stagger className="space-y-4">
        <Field label={t("newPassword")} name="password" type="password" autoComplete="new-password" required
          error={fieldError(state, "password")} />
        <p className="text-xs text-text-tertiary">{t("passwordHint")}</p>
        <SubmitButton>{t("updatePassword")}</SubmitButton>
      </Reveal>
    </form>
  );
}
