import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { RegisterForm } from "@/features/auth/components/register-form";
import { GoogleButton, OrDivider } from "@/features/auth/components/google-button";

export const metadata: Metadata = { title: "Create account · Bazaario" };

export default async function RegisterPage() {
  const t = await getTranslations("Auth");

  return (
    <AuthShell
      title={t("createAccount")}
      subtitle={t("startShopping")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <GoogleButton label={t("signUpWithGoogle")} />
      <OrDivider />
      <RegisterForm />
    </AuthShell>
  );
}
