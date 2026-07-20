import Link from "next/link";
import type { ConversationRow } from "../queries";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  resolved: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  closed: "bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500",
};

const KIND_LABELS: Record<string, string> = {
  customer_vendor: "Store",
  admin_vendor: "Platform",
  admin_customer: "Support",
  internal: "Internal",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * An inbox list. `basePath` differs per audience (`/account/messages` vs
 * `/dashboard/messages`) so the same list serves all three screens.
 */
export function ConversationList({
  items,
  basePath,
  emptyMessage = "No messages yet.",
}: {
  items: ConversationRow[];
  basePath: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 py-16 text-center dark:border-zinc-800">
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="mt-6 space-y-2">
      {items.map((row) => {
        const title =
          row.subject || row.vendorName || row.counterparties.join(", ") || "Conversation";

        return (
          <li key={row.id}>
            <Link
              href={`${basePath}/${row.id}`}
              className="flex items-start gap-4 rounded-xl border border-zinc-200 p-4 transition hover:border-indigo-400 hover:shadow-sm dark:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {title}
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {KIND_LABELS[row.kind] ?? row.kind}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_STYLES[row.status] ?? STATUS_STYLES.closed
                    }`}
                  >
                    {row.status}
                  </span>
                </div>

                {row.counterparties.length > 0 && row.subject ? (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    with {row.counterparties.join(", ")}
                  </p>
                ) : null}

                <p className="mt-1 line-clamp-1 text-sm text-zinc-500">
                  {row.lastMessagePreview ?? "No messages yet."}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-xs text-zinc-400">{relativeTime(row.lastMessageAt)}</span>
                {row.unread > 0 ? (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    aria-label={`${row.unread} unread messages`}
                  >
                    {row.unread}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
