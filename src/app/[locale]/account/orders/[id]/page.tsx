import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { getCurrentUser } from "@/server/security/current-user";
import { getCustomerOrder } from "@/features/orders/queries";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { OrderTimeline } from "@/features/orders/components/order-timeline";
import { ShippingAddress } from "@/features/orders/components/shipping-address";
import { CancelOrderButton } from "@/features/orders/components/cancel-order-button";
import { ReorderButton } from "@/features/orders/components/reorder-button";
import { ReturnRequestForm } from "@/features/orders/components/return-request-form";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Params = { id: string };

export const metadata: Metadata = {
  title: "Order · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CustomerOrderPage({ params }: { params: Promise<Params> }) {
  const locale = await getLocale();
  const t = await getTranslations("OrderDetail");
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/account/orders/${id}`)}`, locale });

  // getCustomerOrder filters on `customer`, so another user's order is a 404
  // rather than a 403 — existence isn't disclosed.
  let order;
  try {
    order = await getCustomerOrder(user.id, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const placedAt = new Date(order.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <nav className="mb-6 text-sm text-text-tertiary">
          <Link href="/account/orders" className="hover:text-brand">
            {t("yourOrders")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-text-secondary">#{order.number}</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              {t("order", { number: order.number })}
            </h1>
            <p className="mt-1 text-sm text-text-tertiary">
              {order.vendorName} · {placedAt}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/*
              Contacting the store about a specific order is the single most
              common reason a shopper needs to talk to anyone, so it lives on
              the order itself. The order id rides along, which both scopes the
              thread and lets the vendor open it without asking "which order?".
            */}
            <Link
              href={`/account/orders/${order.id}/contact`}
              className="rounded-xl border border-border-default px-3 py-1.5 text-sm font-medium text-text-secondary transition hover:bg-surface-raised"
            >
              {t("messageStore")}
            </Link>
            <OrderStatusBadge status={order.status} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ReorderButton orderId={order.id} />
          <Link
            href={`/account/orders/${order.id}/invoice`}
            className="text-sm text-brand hover:underline dark:text-brand"
          >
            {t("downloadInvoice")}
          </Link>
        </div>

        {order.refundedTotal > 0 && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {t("refunded", { amount: formatMoney(order.refundedTotal, order.currency) })}
          </p>
        )}

        <section className="mt-8" aria-label="Items">
          <h2 className="text-sm font-semibold text-foreground">{t("items")}</h2>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center gap-4 py-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-raised">
                  {item.image ? (
                    <Image src={item.image} alt="" fill sizes="56px" className="object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{item.title}</p>
                  <p className="text-xs text-text-tertiary">
                    {item.quantity} × {formatMoney(item.unitPrice, order.currency)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {formatMoney(item.total, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <section aria-label="Delivery">
            <h2 className="text-sm font-semibold text-foreground">{t("delivery")}</h2>
            <div className="mt-2">
              <ShippingAddress address={order.shipping.address} />
            </div>
            <p className="mt-2 text-xs text-text-tertiary">{t("method", { method: order.shipping.method })}</p>
          </section>

          <section aria-label="History">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{t("history")}</h2>
            <OrderTimeline entries={order.timeline} />
          </section>
        </div>

        <div className="mt-8 rounded-2xl border border-border-subtle p-5">
          <OrderSummary totals={order.totals} currency={order.currency} shippingKnown />
        </div>

        {/* Only pending orders may be cancelled; the action re-checks server-side. */}
        {order.status === "pending" && (
          <div className="mt-8">
            <CancelOrderButton orderId={order.id} />
          </div>
        )}

        {/* Only a delivered order can be returned; the action re-checks server-side. */}
        {order.status === "delivered" && (
          <div className="mt-8">
            <ReturnRequestForm orderId={order.id} returns={order.returns} />
          </div>
        )}
      </div>
    </div>
  );
}
