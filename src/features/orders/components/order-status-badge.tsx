import { useTranslations } from "next-intl";
import type { OrderStatus } from "@/server/database/models/order.model";

/**
 * Status pill shared by the customer and vendor order views so a given status
 * always reads the same colour wherever it appears.
 */

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  shipped: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  out_for_delivery: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  refunded: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/**
 * A plain function, not a hook, so callers outside a component render (or in
 * a different component's own `useTranslations` scope) can still label a
 * status — pass the `t` from `useTranslations("OrderStatus")`.
 */
export function orderStatusLabel(status: OrderStatus, t: (key: string) => string): string {
  return t(status) ?? status;
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("OrderStatus");
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STYLES[status] ?? STYLES.pending
      }`}
    >
      {orderStatusLabel(status, t)}
    </span>
  );
}
