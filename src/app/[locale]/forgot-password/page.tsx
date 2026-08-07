import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · Bazaario" };

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth");

  return (
    <AuthShell
      title={t("resetPassword")}
      subtitle={t("resetPasswordHint")}
      footer={
        <Link href="/login" className="font-medium text-brand hover:underline">
          {t("backToSignIn")}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
