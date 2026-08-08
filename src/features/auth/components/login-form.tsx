"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { loginAction } from "../actions";
import { Field, SubmitButton, ResultBanner, fieldError } from "./form-controls";
import { safeRedirectPath } from "@/shared/lib/safe-redirect";
import type { ApiResult } from "@/shared/lib/api-response";
import type { PublicUser } from "@/server/services/auth.service";

export function LoginForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const params = useSearchParams();
  // `next` comes from the URL, so it cannot be trusted as a redirect target.
  const next = safeRedirectPath(params.get("next"));

  const [state, action] = useActionState<ApiResult<PublicUser> | null, FormData>(
    loginAction,
    null,
  );

  useEffect(() => {
    if (state?.ok) router.replace(next);
  }, [state, next, router]);

  const oauthError = params.get("error");

  return (
    <form action={action} className="space-y-4">
      {oauthError && (
        <div className="mb-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {t("googleFailed")}
        </div>
      )}
      <ResultBanner state={state} />
      <Field label={t("email")} name="email" type="email" autoComplete="email" required
        error={fieldError(state, "email")} />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" required
        error={fieldError(state, "password")} />
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" name="rememberMe" value="true"
          className="h-4 w-4 rounded border-border-default text-brand" />
        {t("rememberMe")}
      </label>
      <SubmitButton>{t("signIn")}</SubmitButton>
    </form>
  );
}
