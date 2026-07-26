import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { getVendorOrder } from "@/features/orders/queries";
import { allowedTransitions } from "@/server/services/order.service";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { OrderTimeline } from "@/features/orders/components/order-timeline";
import { ShippingAddress } from "@/features/orders/components/shipping-address";
import { StatusActions } from "@/features/orders/components/status-actions";
import { RefundForm } from "@/features/orders/components/refund-form";
import { ReturnReview } from "@/features/orders/components/return-review";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { PERMISSIONS, roleHasPermission } from "@/shared/constants/rbac";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Params = { id: string };

export const metadata: Metadata = {
  title: "Order · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardOrderPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  let vendor;
  let role;
  try {
    ({ vendor, role } = await resolveActiveVendor());
    await requireVendorPermission(String(vendor._id), PERMISSIONS.ORDER_READ_VENDOR);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect(`/login?next=${encodeURIComponent(`/dashboard/orders/${id}`)}`);
    }
    throw err;
  }

  const vendorId = String(vendor._id);

  // Scoped to this vendor, so another vendor's order is a 404 — tenant isolation
  // holds even for a super admin who has switched into this vendor.
  let order;
  try {
    order = await getVendorOrder(vendorId, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  // Fulfilment and refunds are separate rights; show only what this role holds.
  const canFulfil = roleHasPermission(role, PERMISSIONS.ORDER_FULFILL);
  const canRefund = roleHasPermission(role, PERMISSIONS.ORDER_REFUND);
  const transitions = allowedTransitions(order.status);
  const remaining = order.totals.grandTotal - order.refundedTotal;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/dashboard/orders" className="hover:text-indigo-600">
          Orders
        </Link>
        <span className="mx-2">/</span>
        <span className="text-zinc-700 dark:text-zinc-300">#{order.number}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Order #{order.number}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {new Date(order.createdAt).toLocaleString(undefined, {
              dateStyle: "long",
              timeStyle: "short",
            })}
            {order.guestEmail ? ` · ${order.guestEmail}` : ""}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section aria-label="Items">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Items</h2>
            <ul className="mt-3 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-center gap-4 py-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                    {item.image ? (
                      <Image src={item.image} alt="" fill sizes="48px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{item.title}</p>
                    <p className="text-xs text-zinc-500">
                      {item.sku ? `${item.sku} · ` : ""}
                      {item.quantity} × {formatMoney(item.unitPrice, order.currency)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMoney(item.total, order.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {canFulfil && (
            <section aria-label="Fulfilment">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Fulfilment
              </h2>
              <StatusActions vendorId={vendorId} orderId={order.id} allowed={transitions} />
            </section>
          )}

          {canRefund && order.paymentStatus === "paid" && (
            <section aria-label="Refund">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Refund</h2>
              <RefundForm
                vendorId={vendorId}
                orderId={order.id}
                currency={order.currency}
                remaining={remaining}
              />
            </section>
          )}

          {canRefund && order.returns.some((r) => r.status === "requested") && (
            <section aria-label="Return requests">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Return requests
              </h2>
              <div className="space-y-3">
                {order.returns
                  .filter((r) => r.status === "requested")
                  .map((r) => (
                    <ReturnReview key={r.id} vendorId={vendorId} orderId={order.id} request={r} />
                  ))}
              </div>
            </section>
          )}

          {order.returns.some((r) => r.status !== "requested") && (
            <section aria-label="Return history">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Return history
              </h2>
              <ul className="space-y-2 text-sm">
                {order.returns
                  .filter((r) => r.status !== "requested")
                  .map((r) => (
                    <li key={r.id} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
                      <span>
                        {r.reason} — <span className="capitalize">{r.status}</span>
                        {r.resolutionNote ? ` (${r.resolutionNote})` : ""}
                      </span>
                      <time dateTime={r.resolvedAt ?? undefined} className="shrink-0 text-xs text-zinc-400">
                        {r.resolvedAt ? new Date(r.resolvedAt).toLocaleDateString() : ""}
                      </time>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {order.refunds.length > 0 && (
            <section aria-label="Refunds issued">
              <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Refunds issued
              </h2>
              <ul className="space-y-2 text-sm">
                {order.refunds.map((r, i) => (
                  <li key={i} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
                    <span>
                      {formatMoney(r.amount, order.currency)}
                      {r.reason ? ` — ${r.reason}` : ""}
                    </span>
                    <time dateTime={r.at} className="shrink-0 text-xs text-zinc-400">
                      {new Date(r.at).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-8 lg:col-span-1">
          <section aria-label="Payment">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Payment</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {order.paymentProvider} · {order.paymentStatus}
            </p>
          </section>

          <section aria-label="Delivery">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delivery</h2>
            <div className="mt-2">
              <ShippingAddress address={order.shipping.address} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">Method: {order.shipping.method}</p>
          </section>

          <section aria-label="Totals">
            <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <OrderSummary totals={order.totals} currency={order.currency} shippingKnown />
            </div>
          </section>

          <section aria-label="History">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">History</h2>
            <OrderTimeline entries={order.timeline} />
          </section>
        </aside>
      </div>
    </div>
  );
}
