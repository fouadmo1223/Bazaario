import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LoginForm } from "@/features/auth/components/login-form";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";

export const metadata: Metadata = { title: "Sign in · Bazaario" };

export default async function LoginPage() {
  const t = await getTranslations("Auth");

  return (
    <AuthShell
      title={t("welcomeBack")}
      subtitle={t("signInToAccount")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            {t("createOne")}
          </Link>
        </>
      }
    >
      <GoogleButton label={t("continueWithGoogle")} />
      <OrDivider />
      <Suspense>
        <LoginForm />
      </Suspense>
      <div className="mt-4 text-center">
        <Link href="/forgot-password" className="text-sm text-text-secondary hover:text-brand">
          {t("forgotPassword")}
        </Link>
      </div>
    </AuthShell>
  );
}
