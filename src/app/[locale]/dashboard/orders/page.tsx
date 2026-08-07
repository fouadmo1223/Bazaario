import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { requireVendorPermission } from "@/server/security/current-user";
import { listVendorOrders } from "@/features/orders/queries";
import { OrderStatusBadge, orderStatusLabel } from "@/features/orders/components/order-status-badge";
import { ORDER_STATUSES, type OrderStatus } from "@/server/database/models/order.model";
import { PERMISSIONS } from "@/shared/constants/rbac";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Search = { page?: string; status?: string };

export const metadata: Metadata = {
  title: "Orders · Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function parseStatus(value: string | undefined): OrderStatus | undefined {
  return value && (ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as OrderStatus)
    : undefined;
}

export default async function DashboardOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("DashboardOrders");
  const tStatus = await getTranslations("OrderStatus");
  const { page, status } = await searchParams;

  let vendor;
  try {
    ({ vendor } = await resolveActiveVendor());
    // Staff without order access get bounced rather than shown an empty table.
    await requireVendorPermission(String(vendor._id), PERMISSIONS.ORDER_READ_VENDOR);
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/orders")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const active = parseStatus(status);
  const orders = await listVendorOrders(vendorId, { page, ...(active ? { status: active } : {}) });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {t("count", { count: orders.total })}
          {active ? ` · ${orderStatusLabel(active, tStatus)}` : ""}
        </p>
      </header>

      <nav aria-label={t("filterByStatus")} className="mb-5 flex flex-wrap gap-2">
        <FilterChip label={t("filterAll")} href="/dashboard/orders" active={!active} />
        {ORDER_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={orderStatusLabel(s, tStatus)}
            href={`/dashboard/orders?status=${s}`}
            active={active === s}
          />
        ))}
      </nav>

      {orders.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">{t("noOrders")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <Th>{t("colOrder")}</Th>
                <Th>{t("colPlaced")}</Th>
                <Th>{t("colStatus")}</Th>
                <Th>{t("colPayment")}</Th>
                <Th className="text-right">{t("colTotal")}</Th>
              </tr>
            </thead>
            <tbody>
              {orders.items.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-zinc-100 transition last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-medium text-brand hover:underline dark:text-brand"
                    >
                      #{order.number}
                    </Link>
                    <p className="text-xs text-zinc-500">{t("items", { count: order.itemCount })}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {order.paymentProvider} · {order.paymentStatus}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                    {formatMoney(order.grandTotal, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Pagination">
          <PageLink page={orders.page - 1} status={active} disabled={!orders.hasPrev}>
            {t("prev")}
          </PageLink>
          <span className="text-sm text-zinc-500">
            {t("pageOf", { page: orders.page, totalPages: orders.totalPages })}
          </span>
          <PageLink page={orders.page + 1} status={active} disabled={!orders.hasNext}>
            {t("next")}
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-4 py-2.5 font-medium text-zinc-500 ${className ?? ""}`}>
      {children}
    </th>
  );
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
        active
          ? "bg-brand text-white"
          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
      }`}
    >
      {label}
    </Link>
  );
}

function PageLink({
  page,
  status,
  disabled,
  children,
}: {
  page: number;
  status?: OrderStatus;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-sm text-zinc-300 dark:text-zinc-700">{children}</span>;
  }
  const query = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) });
  return (
    <Link
      href={`/dashboard/orders?${query}`}
      className="text-sm text-brand hover:underline dark:text-brand"
    >
      {children}
    </Link>
  );
}
