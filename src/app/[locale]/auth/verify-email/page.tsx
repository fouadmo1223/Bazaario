import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { authService } from "@/server/services/auth.service";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = { title: "Verify email · Bazaario" };

/**
 * Server Component: consumes the verification token on load. Because this runs
 * on GET, the token is single-use and idempotency is handled by the service
 * (a second click shows "invalid or already used").
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Auth");
  const { token } = await searchParams;

  let status: "success" | "error" | "missing" = "missing";
  let message = t("noVerificationToken");

  if (token) {
    const result = await authService.verifyEmail(token).then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err }),
    );
    if (result.ok) {
      status = "success";
      message = t("emailVerified");
    } else {
      status = "error";
      message = isAppError(result.err) ? result.err.message : t("verificationInvalid");
    }
  }

  const success = status === "success";
  return (
    <AuthShell title={success ? t("emailVerifiedTitle") : t("verificationFailedTitle")}>
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          success
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
            : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
        }`}
      >
        {message}
      </div>
      <Link
        href={success ? "/login" : "/register"}
        className="mt-6 flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
      >
        {success ? t("continueToSignIn") : t("backToSignUp")}
      </Link>
    </AuthShell>
  );
}
