import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/security/current-user";
import { getWalletView } from "@/features/wallet/queries";
import { formatMoney } from "@/shared/lib/format";

export const metadata: Metadata = {
  title: "Wallet · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Store credit is platform-wide (USD; there's no per-customer currency to
 * read it back in — same assumption `formatMoney`'s callers make elsewhere
 * when there's no order/cart currency to hand it).
 */
export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/wallet")}`);

  const { balance, history } = await getWalletView(user.id);

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Wallet
        </h1>

        <div className="mt-6 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Balance</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatMoney(balance, "USD")}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Store credit, usable at checkout with any store.
          </p>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Activity</h2>
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {history.map((txn) => (
                <li key={txn.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-900 dark:text-zinc-100">{txn.reason}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(txn.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${
                      txn.type === "credit"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-zinc-900 dark:text-zinc-100"
                    }`}
                  >
                    {txn.type === "credit" ? "+" : "−"}
                    {formatMoney(txn.amount, "USD")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
