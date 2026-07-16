import type { Metadata } from "next";
import { Suspense } from "react";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { analyticsService } from "@/server/services/analytics.service";
import { KpiCard } from "@/features/dashboard/components/kpi-card";
import { RevenueChart } from "@/features/dashboard/components/revenue-chart";

export const metadata: Metadata = { title: "Dashboard · Commerce" };

// Always fresh — dashboards reflect live orders.
export const dynamic = "force-dynamic";

function money(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

async function DashboardContent() {
  const { vendor, role } = await resolveActiveVendor();
  const vendorId = String(vendor._id);
  const currency = vendor.settings.currency;

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
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{role.replace("_", " ")}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {vendor.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Last 30 days</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue" value={money(kpis.revenue, currency)} hint={`${kpis.orders} orders`} />
        <KpiCard label="Average order" value={money(kpis.averageOrderValue, currency)} />
        <KpiCard label="Customers" value={kpis.customers} hint={`${retention.repeatRate}% repeat`} />
        <KpiCard label="Products" value={vendor.stats.products} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Revenue over time</h2>
        <RevenueChart data={series} currency={currency} />
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Top products</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {top.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">No sales yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {top.map((p) => (
                    <tr key={p.productId} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{p.title}</td>
                      <td className="px-4 py-3 text-right text-zinc-500 tabular-nums">{p.units} sold</td>
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
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Low stock</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {lowStock.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">Everything is well stocked.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {lowStock.map((p) => (
                    <tr key={String(p._id)} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                      <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{p.title}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {p.stock} left
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
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-zinc-500">Loading dashboard…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
