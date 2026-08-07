"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { driverUpdateStatusAction } from "../actions";
import { orderStatusLabel } from "./order-status-badge";
import type { OrderStatus } from "@/server/database/models/order.model";

/**
 * The driver's two-step delivery progress. Deliberately narrower than the
 * vendor's `StatusActions` — a driver can only move an order forward through
 * shipped → out for delivery → delivered, which `driverUpdateStatusAction`
 * also enforces server-side (and it re-checks the order is assigned to them).
 */
export function DeliveryStatusActions({
  vendorId,
  orderId,
  status,
}: {
  vendorId: string;
  orderId: string;
  status: OrderStatus;
}) {
  const t = useTranslations("DeliveryStatusActions");
  const tStatus = useTranslations("OrderStatus");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const next: OrderStatus | null =
    status === "shipped" ? "out_for_delivery" : status === "out_for_delivery" ? "delivered" : null;

  if (!next) {
    return (
      <p className="text-sm text-zinc-500">
        {t("nothingToUpdate", { status: orderStatusLabel(status, tStatus) })}
      </p>
    );
  }

  function mark() {
    setError(null);
    startTransition(async () => {
      const result = await driverUpdateStatusAction(vendorId, orderId, next!);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={mark}
        disabled={pending}
        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {pending ? t("updating") : t("markStatus", { status: orderStatusLabel(next, tStatus) })}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
