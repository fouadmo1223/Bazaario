import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password · Bazaario" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Auth");
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthShell title={t("invalidResetLink")}>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          {t("missingToken")}
        </div>
        <Link
          href="/forgot-password"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          {t("requestNewLink")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("chooseNewPassword")} subtitle={t("chooseNewPasswordSubtitle")}>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
