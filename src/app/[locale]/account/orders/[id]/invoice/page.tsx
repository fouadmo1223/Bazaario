import type { Metadata } from "next";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { getCurrentUser } from "@/server/security/current-user";
import { getCustomerOrder } from "@/features/orders/queries";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { InvoicePrintButton } from "@/features/orders/components/invoice-print-button";
import { formatMoney } from "@/shared/lib/format";
import { isAppError } from "@/shared/lib/errors";

type Params = { id: string };

export const metadata: Metadata = {
  title: "Invoice · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OrderInvoicePage({ params }: { params: Promise<Params> }) {
  const locale = await getLocale();
  const t = await getTranslations("Invoice");
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(`/account/orders/${id}/invoice`)}`, locale });

  // getCustomerOrder filters on `customer`, so another user's order is a 404
  // rather than a 403 — existence isn't disclosed.
  let order;
  try {
    order = await getCustomerOrder(user.id, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const placedAt = new Date(order.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const addr = order.shipping.address;
  const billTo = addr?.recipient || order.guestEmail || t("customer");
  const addressLines = [addr?.line1, addr?.line2, [addr?.city, addr?.region, addr?.postalCode].filter(Boolean).join(", "), addr?.country].filter(
    (line): line is string => Boolean(line),
  );

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-3xl px-6 py-10 print:px-0 print:py-6">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/account/orders/${order.id}`} className="text-sm text-zinc-500 hover:text-brand">
            {t("backToOrder")}
          </Link>
          <InvoicePrintButton />
        </div>

        <div className="mt-8 flex items-start justify-between print:mt-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t("invoice")}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{order.vendorName}</p>
          </div>
          <div className="text-right text-sm text-zinc-500">
            <p>{t("order", { number: order.number })}</p>
            <p>{placedAt}</p>
            <p className="capitalize">{order.paymentStatus}</p>
          </div>
        </div>

        <div className="mt-8 text-sm">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{t("billTo")}</p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">{billTo}</p>
          {addressLines.map((line, i) => (
            <p key={i} className="text-zinc-600 dark:text-zinc-400">
              {line}
            </p>
          ))}
        </div>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <th className="py-2 font-medium">{t("item")}</th>
              <th className="py-2 font-medium">{t("sku")}</th>
              <th className="py-2 text-right font-medium">{t("qty")}</th>
              <th className="py-2 text-right font-medium">{t("unitPrice")}</th>
              <th className="py-2 text-right font-medium">{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="py-3 text-zinc-900 dark:text-zinc-100">{item.title}</td>
                <td className="py-3 text-zinc-500">{item.sku ?? "—"}</td>
                <td className="py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{item.quantity}</td>
                <td className="py-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatMoney(item.unitPrice, order.currency)}
                </td>
                <td className="py-3 text-right tabular-nums font-medium text-zinc-900 dark:text-zinc-50">
                  {formatMoney(item.total, order.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-xs">
            <OrderSummary totals={order.totals} currency={order.currency} shippingKnown />
          </div>
        </div>

        {order.refundedTotal > 0 && (
          <p className="mt-4 text-right text-sm text-red-600 dark:text-red-400">
            {t("refunded", { amount: formatMoney(order.refundedTotal, order.currency) })}
          </p>
        )}
      </div>
    </div>
  );
}
