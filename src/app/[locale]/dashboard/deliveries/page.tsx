import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listDriverOrders } from "@/features/orders/queries";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Search = { page?: string };

export const metadata: Metadata = {
  title: "Deliveries · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** A driver's own queue: orders assigned to them, shipped but not yet delivered. */
export default async function DriverDeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { page } = await searchParams;

  let vendor;
  let user;
  try {
    ({ vendor } = await resolveActiveVendor());
    ({ user } = await requireVendorPermission(String(vendor._id), PERMISSIONS.DELIVERY_UPDATE));
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect(`/login?next=${encodeURIComponent("/dashboard/deliveries")}`);
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const orders = await listDriverOrders(vendorId, user.id, { page });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Deliveries
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {orders.total} {orders.total === 1 ? "order" : "orders"} out with you
        </p>
      </header>

      {orders.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Nothing assigned to you right now.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/dashboard/deliveries/${order.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    #{order.number}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{order.vendorName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMoney(order.grandTotal, order.currency)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {orders.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <PageLink page={orders.page - 1} disabled={!orders.hasPrev}>
            ← Previous
          </PageLink>
          <span className="text-sm text-zinc-500">
            Page {orders.page} of {orders.totalPages}
          </span>
          <PageLink page={orders.page + 1} disabled={!orders.hasNext}>
            Next →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm text-zinc-300 dark:text-zinc-700">{children}</span>;
  }
  return (
    <Link
      href={`/dashboard/deliveries?page=${page}`}
      className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {children}
    </Link>
  );
}
