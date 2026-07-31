import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getVendorOrder } from "@/features/orders/queries";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { ShippingAddress } from "@/features/orders/components/shipping-address";
import { DeliveryStatusActions } from "@/features/orders/components/delivery-status-actions";
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
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  let vendor;
  let user;
  try {
    ({ vendor } = await resolveActiveVendor());
    ({ user } = await requireVendorPermission(String(vendor._id), PERMISSIONS.DELIVERY_UPDATE));
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect(`/login?next=${encodeURIComponent(`/dashboard/deliveries/${id}`)}`);
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
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/dashboard/deliveries" className="hover:text-indigo-600">
          Deliveries
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">#{order.number}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Order #{order.number}
        </h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <section className="mt-8" aria-label="Deliver to">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Deliver to</h2>
        <div className="mt-2">
          <ShippingAddress address={order.shipping.address} />
        </div>
      </section>

      <section className="mt-8" aria-label="Items">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Items</h2>
        <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="text-zinc-900 dark:text-zinc-100">{item.title}</span>
              <span className="text-zinc-500">× {item.quantity}</span>
            </li>
          ))}
        </ul>
      </section>

      {order.paymentProvider === "cod" && order.paymentStatus !== "paid" && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          Collect {formatMoney(order.grandTotal, order.currency)} on delivery (cash on delivery).
        </p>
      )}

      <div className="mt-8">
        <DeliveryStatusActions vendorId={vendorId} orderId={order.id} status={order.status} />
      </div>
    </div>
  );
}
