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
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">
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
        <div className="rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-tertiary">{t("noOrders")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border-subtle bg-surface-raised text-left">
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
                  className="border-b border-border-subtle transition last:border-0 hover:bg-surface-raised"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="font-medium text-brand hover:underline dark:text-brand"
                    >
                      #{order.number}
                    </Link>
                    <p className="text-xs text-text-tertiary">{t("items", { count: order.itemCount })}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(order.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {order.paymentProvider} · {order.paymentStatus}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
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
          <span className="text-sm text-text-tertiary">
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
    <th scope="col" className={`px-4 py-2.5 font-medium text-text-tertiary ${className ?? ""}`}>
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
          : "border border-border-subtle text-text-secondary hover:bg-surface-raised"
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
    return <span className="text-sm text-text-tertiary">{children}</span>;
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
