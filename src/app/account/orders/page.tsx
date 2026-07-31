import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/security/current-user";
import { listCustomerOrders } from "@/features/orders/queries";
import { OrderStatusBadge } from "@/features/orders/components/order-status-badge";
import { formatMoney } from "@/shared/lib/format";

type Search = { page?: string };

export const metadata: Metadata = {
  title: "Your orders · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await getCurrentUser();
  // Send them back here after signing in rather than dropping them on the home page.
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/orders")}`);

  const { page } = await searchParams;
  const orders = await listCustomerOrders(user.id, { page });

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your orders
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {orders.total} {orders.total === 1 ? "order" : "orders"}
        </p>

        {orders.items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
            <p className="text-sm text-zinc-500">You haven&apos;t placed any orders yet.</p>
          </div>
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {orders.items.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="flex items-center gap-4 rounded-xl border border-zinc-200 p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-zinc-800"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      {order.firstItemImage ? (
                        <Image
                          src={order.firstItemImage}
                          alt=""
                          fill
                          sizes="64px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          #{order.number}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-zinc-600 dark:text-zinc-400">
                        {order.firstItemTitle}
                        {order.itemCount > 1 ? ` + ${order.itemCount - 1} more` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {order.vendorName} ·{" "}
                        {new Date(order.createdAt).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                      {formatMoney(order.grandTotal, order.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {orders.totalPages > 1 && (
              <nav className="mt-8 flex items-center justify-between" aria-label="Pagination">
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
          </>
        )}
      </div>
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
      href={`/account/orders?page=${page}`}
      className="text-sm text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {children}
    </Link>
  );
}
