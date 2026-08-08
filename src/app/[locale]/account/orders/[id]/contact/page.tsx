import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/server/security/current-user";
import { getCustomerOrder } from "@/features/orders/queries";
import { NewConversationForm } from "@/features/messages/components/new-conversation-form";
import { isAppError } from "@/shared/lib/errors";

export const metadata: Metadata = {
  title: "Message store · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Shopper → the store that fulfilled a specific order.
 *
 * The order is re-fetched through the customer-scoped query rather than trusted
 * from the URL: without that, anyone could open this page with someone else's
 * order id and start a thread carrying a vendor and order they have no claim to.
 */
export default async function ContactVendorPage({ params }: { params: Promise<{ id: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("ContactVendor");
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/account/orders/${id}/contact`)}`, locale });

  let order;
  try {
    order = await getCustomerOrder(user.id, id);
  } catch (err) {
    if (isAppError(err) && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href={`/account/orders/${id}`}
          className="text-sm text-text-tertiary hover:text-foreground"
        >
          {t("backToOrder", { number: order.number })}
        </Link>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
          {t("messageVendor", { vendor: order.vendorName })}
        </h1>
        <p className="mt-1 mb-6 text-sm text-text-tertiary">{t("aboutOrder", { number: order.number })}</p>

        <NewConversationForm
          kind="customer_vendor"
          vendorId={order.vendorId}
          orderId={order.id}
          basePath="/account/messages"
          defaultSubject={`Order #${order.number}`}
        />
      </div>
    </div>
  );
}
