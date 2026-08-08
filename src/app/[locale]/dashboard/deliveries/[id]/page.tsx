import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getVendorOrder } from "@/features/orders/queries";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { ShippingAddress } from "@/features/orders/components/shipping-address";
import { DeliveryStatusActions } from "@/features/orders/components/delivery-status-actions";
import { LocationSharing } from "@/features/orders/components/location-sharing";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Params = { id: string };

export const metadata: Metadata = {
  title: "Delivery · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DriverDeliveryPage({ params }: { params: Promise<Params> }) {
  const locale = await getLocale();
  const t = await getTranslations("DeliveryDetail");
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  let vendor;
  let user;
  try {
    ({ vendor } = await resolveActiveVendor());
    ({ user } = await requireVendorPermission(String(vendor._id), PERMISSIONS.DELIVERY_UPDATE));
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent(`/dashboard/deliveries/${id}`)}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);

  let order;
  try {
    order = await getVendorOrder(vendorId, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  // A driver only sees deliveries assigned to them — existence isn't disclosed.
  if (order.shipping.driverId !== user.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <nav className="mb-6 text-sm text-text-tertiary">
        <Link href="/dashboard/deliveries" className="hover:text-brand">
          {t("deliveries")}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-text-secondary">#{order.number}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("order", { number: order.number })}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <section className="mt-8" aria-label="Deliver to">
        <h2 className="text-sm font-semibold text-foreground">{t("deliverTo")}</h2>
        <div className="mt-2">
          <ShippingAddress address={order.shipping.address} />
        </div>
      </section>

      <section className="mt-8" aria-label="Items">
        <h2 className="text-sm font-semibold text-foreground">{t("items")}</h2>
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="text-foreground">{item.title}</span>
              <span className="text-text-tertiary">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      {order.paymentProvider === "cod" && order.paymentStatus !== "paid" && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {t("collectCod", { amount: formatMoney(order.grandTotal, order.currency) })}
        </p>
      )}

      {order.status === "out_for_delivery" && (
        <div className="mt-8">
          <LocationSharing orderId={order.id} />
        </div>
      )}

      <div className="mt-8">
        <DeliveryStatusActions vendorId={vendorId} orderId={order.id} status={order.status} />
      </div>
    </div>
  );
}
