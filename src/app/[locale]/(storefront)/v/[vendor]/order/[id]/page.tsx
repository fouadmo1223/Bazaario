import type { Metadata } from "next";
import Link from "next/link";
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

const PAYMENT_NOTE: Record<string, string> = {
  cod: "Pay the courier when your order arrives.",
  stripe: "Paid by card.",
  paymob: "Paid via Paymob.",
  wallet: "Paid from your wallet.",
};

export default async function OrderConfirmationPage({ params }: { params: Promise<Params> }) {
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

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
          <h1 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">
            Thank you — your order is placed
          </h1>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            Order <span className="font-semibold">#{order.number}</span> · {placedAt}
          </p>
        </div>

        <section className="mt-8" aria-label="Items">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Items</h2>
          <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between gap-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-zinc-900 dark:text-zinc-100">{item.title}</span>
                  <span className="text-xs text-zinc-500">
                    {item.quantity} × {formatMoney(item.unitPrice, currency)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatMoney(item.total, currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <section aria-label="Delivery">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delivery</h2>
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
            <p className="mt-2 text-xs text-zinc-500">
              Method: {order.shipping?.method ?? "standard"}
            </p>
          </section>

          <section aria-label="Payment">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {PAYMENT_NOTE[order.payment.provider] ?? order.payment.provider}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Status: {order.payment.status} · Order status: {order.status}
            </p>
          </section>
        </div>

        {order.status === "out_for_delivery" && (
          <section className="mt-8" aria-label="Track your delivery">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Track your delivery
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

        <div className="mt-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
          <OrderSummary totals={order.totals} currency={currency} shippingKnown />
        </div>

        <Link
          href={`/v/${vendorSlug}`}
          className="mt-8 inline-block rounded-lg border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
