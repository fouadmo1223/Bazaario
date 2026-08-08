import { useTranslations } from "next-intl";
import { orderStatusLabel } from "./order-status-badge";
import type { OrderStatus } from "@/server/database/models/order.model";

/** Chronological history of an order, oldest first. */
export function OrderTimeline({
  entries,
}: {
  entries: { status: string; note: string | null; at: string }[];
}) {
  const t = useTranslations("OrderStatus");
  if (entries.length === 0) return null;

  return (
    <ol className="space-y-3">
      {entries.map((entry, i) => {
        const isLatest = i === entries.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                isLatest ? "bg-brand" : "bg-surface-raised"
              }`}
            />
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                {orderStatusLabel(entry.status as OrderStatus, t)}
              </p>
              {entry.note && <p className="text-xs text-text-tertiary">{entry.note}</p>}
              <time
                dateTime={entry.at}
                className="text-xs text-text-tertiary"
              >
                {new Date(entry.at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
