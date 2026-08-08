import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { Order } from "@/server/database/models/order.model";
import { connectToDatabase } from "@/server/database/connection";
import { vendorService } from "@/server/services/vendor.service";
import { getCurrentUser } from "@/server/security/current-user";
import { canViewOrder } from "@/server/security/order-access";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { ShippingAddress } from "@/features/orders/components/shipping-address";
import { DeliveryMap } from "@/features/orders/components/delivery-map-loader";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Params = { vendor: string; id: string };

export const metadata: Metadata = {
  title: "Your order · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OrderConfirmationPage({ params }: { params: Promise<Params> }) {
  const t = await getTranslations("OrderConfirmation");
  const { vendor: vendorSlug, id } = await params;

  // A malformed id is a 404, not a cast error.
  if (!Types.ObjectId.isValid(id)) notFound();

  let vendor;
  try {
    vendor = await vendorService.getBySlug(vendorSlug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  await connectToDatabase();
  const order = await Order.findOne({ _id: id, vendor: vendor._id });
  if (!order) notFound();

  const user = await getCurrentUser();
  // Not yours and no grant from placing it: reveal nothing, not even existence.
  if (!(await canViewOrder(order, user?.id))) notFound();

  const currency = order.currency;
  const placedAt = order.createdAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const paymentNote: Record<string, string> = {
    cod: t("codNote"),
    stripe: t("stripeNote"),
    paymob: t("paymobNote"),
    wallet: t("walletNote"),
  };

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
          <h1 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">
            {t("thankYou")}
          </h1>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            {t("order", { number: order.number })} · {placedAt}
          </p>
        </div>

        <section className="mt-8" aria-label="Items">
          <h2 className="text-sm font-semibold text-foreground">{t("items")}</h2>
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{item.title}</span>
                  <span className="text-xs text-text-tertiary">
                    {item.quantity} × {formatMoney(item.unitPrice, currency)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {formatMoney(item.total, currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <section aria-label="Delivery">
            <h2 className="text-sm font-semibold text-foreground">{t("delivery")}</h2>
            <div className="mt-2">
              <ShippingAddress
                address={
                  order.shipping?.address
                    ? {
                        recipient: order.shipping.address.recipient ?? null,
                        phone: order.shipping.address.phone ?? null,
                        line1: order.shipping.address.line1 ?? null,
                        line2: order.shipping.address.line2 ?? null,
                        city: order.shipping.address.city ?? null,
                        region: order.shipping.address.region ?? null,
                        postalCode: order.shipping.address.postalCode ?? null,
                        country: order.shipping.address.country ?? null,
                      }
                    : null
                }
              />
            </div>
            <p className="mt-2 text-xs text-text-tertiary">
              {t("method", { method: order.shipping?.method ?? "standard" })}
            </p>
          </section>

          <section aria-label="Payment">
            <h2 className="text-sm font-semibold text-foreground">{t("payment")}</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {paymentNote[order.payment.provider] ?? order.payment.provider}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {t("statusLine", { paymentStatus: order.payment.status, orderStatus: order.status })}
            </p>
          </section>
        </div>

        {order.status === "out_for_delivery" && (
          <section className="mt-8" aria-label="Track your delivery">
            <h2 className="mb-3 text-sm font-semibold text-foreground">
              {t("trackDelivery")}
            </h2>
            <DeliveryMap
              orderId={String(order._id)}
              destination={
                order.shipping?.address?.geo?.lat != null && order.shipping?.address?.geo?.lng != null
                  ? { lat: order.shipping.address.geo.lat, lng: order.shipping.address.geo.lng }
                  : null
              }
            />
          </section>
        )}

        <div className="mt-8 rounded-2xl border border-border-subtle p-5">
          <OrderSummary totals={order.totals} currency={currency} shippingKnown />
        </div>

        <Link
          href={`/v/${vendorSlug}`}
          className="mt-8 inline-block rounded-lg border border-border-default px-5 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-surface-raised"
        >
          {t("continueShopping")}
        </Link>
      </div>
    </div>
  );
}
