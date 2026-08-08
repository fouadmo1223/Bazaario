import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/server/security/current-user";
import { NewConversationForm } from "@/features/messages/components/new-conversation-form";

export const metadata: Metadata = {
  title: "Contact support · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Shopper → platform support.
 *
 * No recipient picker: a shopper contacting support is contacting the platform,
 * and letting them address a named admin would leak the staff roster and route
 * around whoever is actually on duty.
 */
export default async function NewSupportThreadPage() {
  const locale = await getLocale();
  const t = await getTranslations("ContactSupport");
  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent("/account/messages/new")}`, locale });

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/account/messages" className="text-sm text-text-tertiary hover:text-foreground">
          {t("backToMessages")}
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 mb-6 text-sm text-text-tertiary">{t("hint")}</p>

        <NewConversationForm kind="admin_customer" basePath="/account/messages" />
      </div>
    </div>
  );
}
