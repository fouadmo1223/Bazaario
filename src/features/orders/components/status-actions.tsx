"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { updateOrderStatusAction } from "../actions";
import { orderStatusLabel } from "./order-status-badge";
import type { OrderStatus } from "@/server/database/models/order.model";

/**
 * Move an order to its next status.
 *
 * Only the transitions the service considers legal are offered — the parent
 * derives them from `allowedTransitions`, and the service re-checks on submit,
 * so a stale page can't force an illegal jump like delivered → pending.
 */
export function StatusActions({
  vendorId,
  orderId,
  allowed,
}: {
  vendorId: string;
  orderId: string;
  allowed: readonly OrderStatus[];
}) {
  const t = useTranslations("OrderStatus");
  const tActions = useTranslations("StatusActions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<OrderStatus | null>(null);

  if (allowed.length === 0) {
    return <p className="text-sm text-zinc-500">{tActions("finalState")}</p>;
  }

  function move(status: OrderStatus) {
    setError(null);
    setTarget(status);
    startTransition(async () => {
      const result = await updateOrderStatusAction(vendorId, orderId, status);
      setTarget(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => move(status)}
            disabled={pending}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              status === "cancelled" || status === "refunded"
                ? "border border-zinc-300 text-zinc-700 hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300"
                : "bg-brand text-white hover:bg-brand-hover"
            }`}
          >
            {pending && target === status
              ? tActions("working")
              : tActions("markAs", { status: orderStatusLabel(status, t) })}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
