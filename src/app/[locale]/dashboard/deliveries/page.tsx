import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
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
  const locale = await getLocale();
  const t = await getTranslations("DashboardDeliveries");
  const { page } = await searchParams;

  let vendor;
  let user;
  try {
    ({ vendor } = await resolveActiveVendor());
    ({ user } = await requireVendorPermission(String(vendor._id), PERMISSIONS.DELIVERY_UPDATE));
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard/deliveries")}`, locale });
    }
    throw err;
  }

  const vendorId = String(vendor._id);
  const orders = await listDriverOrders(vendorId, user.id, { page });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-text-tertiary">{t("count", { count: orders.total })}</p>
      </header>

      {orders.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border-default p-12 text-center">
          <p className="text-sm text-text-tertiary">{t("nothingAssigned")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.items.map((order) => (
            <li key={order.id}>
              <Link
                href={`/dashboard/deliveries/${order.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-border-subtle p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    #{order.number}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{order.vendorName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <OrderStatusBadge status={order.status} />
                  <span className="text-sm font-medium tabular-nums text-foreground">
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
            {t("prev")}
          </PageLink>
          <span className="text-sm text-text-tertiary">
            {t("pageOf", { page: orders.page, totalPages: orders.totalPages })}
          </span>
          <PageLink page={orders.page + 1} disabled={!orders.hasNext}>
            {t("next")}
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
    return <span className="text-sm text-text-tertiary">{children}</span>;
  }
  return (
    <Link
      href={`/dashboard/deliveries?page=${page}`}
      className="text-sm text-brand hover:underline dark:text-brand"
    >
      {children}
    </Link>
  );
}
