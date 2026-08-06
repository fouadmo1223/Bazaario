import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { isAppError } from "@/shared/lib/errors";
import { analyticsService } from "@/server/services/analytics.service";
import { KpiCard } from "@/features/dashboard/components/kpi-card";
import { RevenueChart } from "@/features/dashboard/components/revenue-chart";

export const metadata: Metadata = { title: "Dashboard · Bazaario" };

// Always fresh — dashboards reflect live orders.
export const dynamic = "force-dynamic";

function money(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

/**
 * The analytics panels only. Auth is resolved by the page before this streams —
 * see the note on `DashboardPage`.
 */
async function DashboardPanels({
  vendorId,
  currency,
  productCount,
}: {
  vendorId: string;
  currency: string;
  productCount: number;
}) {
  const t = await getTranslations("DashboardOverview");
  // Reading the clock is intentional here: this is an async Server Component
  // rendered per-request (`force-dynamic`), so the window must track real time.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const range = { from: new Date(now - 29 * 86400_000), to: new Date(now) };

  // Fetch the panels in parallel — they're independent aggregations.
  const [kpis, series, top, retention, lowStock] = await Promise.all([
    analyticsService.kpis(vendorId, range),
    analyticsService.revenueSeries(vendorId, range),
    analyticsService.topProducts(vendorId, range, 5),
    analyticsService.retention(vendorId, range),
    analyticsService.lowStock(vendorId, 5),
  ]);

  return (
    <>
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("revenue")}
          value={money(kpis.revenue, currency)}
          hint={t("orders", { count: kpis.orders })}
        />
        <KpiCard label={t("averageOrder")} value={money(kpis.averageOrderValue, currency)} />
        <KpiCard
          label={t("customers")}
          value={kpis.customers}
          hint={t("repeat", { percent: retention.repeatRate })}
        />
        <KpiCard label={t("products")} value={productCount} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {t("revenueOverTime")}
        </h2>
        <RevenueChart data={series} currency={currency} />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t("topProducts")}
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {top.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">{t("noSales")}</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {top.map((p) => (
                    <tr key={p.productId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{p.title}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">
                        {t("unitsSold", { count: p.units })}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                        {money(p.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {t("lowStock")}
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {lowStock.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">{t("wellStocked")}</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {lowStock.map((p) => (
                    <tr key={String(p._id)} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{p.title}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {t("left", { count: p.stock })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Auth is resolved here, in the page body, *before* anything streams.
 *
 * It cannot move inside the Suspense boundary below. Next flushes the shell —
 * including the fallback — as soon as it hits `<Suspense>`, and the response is
 * committed with a 200 at that moment. A `redirect(...)` thrown after that has no
 * status line or `Location` header left to set, so the visitor is stranded on
 * "Loading dashboard…" forever instead of being sent to sign in.
 *
 * Membership lookup is two indexed queries; the slow part is the aggregations,
 * and those are what the boundary is actually for.
 */
export default async function DashboardPage() {
  const locale = await getLocale();
  const t = await getTranslations("DashboardOverview");
  let vendor;
  let role;
  try {
    ({ vendor, role } = await resolveActiveVendor());
  } catch (err) {
    if (isAppError(err) && (err.code === "UNAUTHORIZED" || err.code === "FORBIDDEN")) {
      redirect({ href: `/login?next=${encodeURIComponent("/dashboard")}`, locale });
    }
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{role.replace(/_/g, " ")}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {vendor.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("last30Days")}</p>
      </header>

      <Suspense fallback={<div className="py-10 text-sm text-zinc-500">{t("loadingAnalytics")}</div>}>
        <DashboardPanels
          vendorId={String(vendor._id)}
          currency={vendor.settings.currency}
          productCount={vendor.stats.products}
        />
      </Suspense>
    </div>
  );
}
