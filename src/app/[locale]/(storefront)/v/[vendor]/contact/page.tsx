import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { getCurrentUser } from "@/server/security/current-user";
import { NewConversationForm } from "@/features/messages/components/new-conversation-form";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Message store · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Shopper → store, with no order involved.
 *
 * The vendor is resolved from its slug here rather than taken from a hidden
 * field, so the thread can only ever be addressed to a store that exists and is
 * actually trading — a suspended vendor 404s instead of collecting messages
 * nobody will answer.
 *
 * Guests are sent to sign in first. Anonymous messaging would need a way to
 * deliver the reply, and every such channel (email round-trip, magic link) is a
 * bigger feature than the inbox itself.
 */
export default async function ContactStorePage({
  params,
}: {
  params: Promise<{ vendor: string }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("ContactStore");
  const { vendor: slug } = await params;

  let vendor;
  try {
    vendor = await vendorService.getBySlug(slug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  if (vendor.status !== "active") notFound();

  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/v/${slug}/contact`)}`, locale });

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href={`/v/${slug}`}
          className="text-sm text-text-tertiary hover:text-foreground"
        >
          ← {vendor.name}
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          {t("messageVendor", { vendor: vendor.name })}
        </h1>
        <p className="mt-1 mb-6 text-sm text-text-tertiary">
          {t("askAbout")}{" "}
          <Link href="/account/messages" className="underline">
            {t("messages")}
          </Link>
          {t("orderQuestion")}
        </p>

        <NewConversationForm
          kind="customer_vendor"
          vendorId={String(vendor._id)}
          basePath="/account/messages"
        />
      </div>
    </div>
  );
}
