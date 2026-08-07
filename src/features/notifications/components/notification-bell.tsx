"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSocket } from "@/shared/hooks/use-socket";
import { useStorefront } from "@/features/storefront/storefront-provider";
import { markAllNotificationsReadAction, markNotificationReadAction } from "../actions";

/**
 * The notification bell.
 *
 * Two sources feed one number. The badge starts from the server count that
 * ships with the rest of the header's per-visitor state, and live arrivals from
 * the socket increment it on top — so the badge is right on first paint *and*
 * moves without a refresh. Whenever the server count refreshes (any navigation)
 * it wins outright, which is what stops the two sources drifting apart.
 *
 * The list itself is fetched only when the bell is opened. Most page views never
 * open it, and carrying twenty titles and bodies through every navigation to
 * render a number would be paying for the whole panel to show a dot.
 *
 * Works with or without `StorefrontProvider`. The storefront header has one and
 * the count rides along with the rest of its per-visitor state; the dashboard
 * has no such provider, so that chrome resolves the count on the server and
 * passes it as `initialUnread` instead. Either way the socket drives it from
 * there.
 */

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

/** The socket payload is a subset of the stored row. */
type LiveNotification = {
  id: string;
  type?: string;
  title: string;
  body?: string | null;
  link?: string | null;
  createdAt?: string;
};

export function NotificationBell({ initialUnread = 0 }: { initialUnread?: number } = {}) {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const storefront = useStorefront();
  const { socket } = useSocket();

  const serverUnread = storefront?.notificationCount ?? initialUnread;
  const [unread, setUnread] = useState(serverUnread);
  const [syncedFrom, setSyncedFrom] = useState(serverUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // The server count is authoritative whenever it refreshes, and this is the
  // sanctioned way to fold a changing prop back into state: adjust during
  // render, not in an effect. An effect would paint the stale number first and
  // then correct it — a visible flicker on every navigation.
  if (syncedFrom !== serverUnread) {
    setSyncedFrom(serverUnread);
    setUnread(serverUnread);
  }

  // Live arrivals: bump the badge, and slot it into the list if it is loaded.
  useEffect(() => {
    if (!socket) return;
    const onNotification = (payload: LiveNotification) => {
      setUnread((n) => n + 1);
      setItems((prev) =>
        prev
          ? [
              {
                id: payload.id,
                type: payload.type ?? "system",
                title: payload.title,
                body: payload.body ?? null,
                link: payload.link ?? null,
                readAt: null,
                createdAt: payload.createdAt ?? new Date().toISOString(),
              },
              ...prev.filter((i) => i.id !== payload.id),
            ].slice(0, 20)
          : prev,
      );
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [socket]);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /**
   * Re-read the authoritative count after a write. With the provider that means
   * refetching the header's per-visitor state; without one (the dashboard) the
   * count came from the server render, so re-rendering the route is what picks
   * the new value up.
   */
  const refreshCount = useCallback(() => {
    if (storefront) storefront.refresh();
    else router.refresh();
  }, [storefront, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { ok: boolean; data?: { unread: number; items: NotificationItem[] } };
      if (!body.ok || !body.data) throw new Error();
      setItems(body.data.items);
      setUnread(body.data.unread);
    } catch {
      setError(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void load();
  }

  function openItem(item: NotificationItem) {
    if (!item.readAt) {
      // Optimistic: the panel is about to close, so waiting on the round-trip
      // would just show a stale unread dot on the way out.
      setItems((prev) =>
        prev ? prev.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) : prev,
      );
      setUnread((n) => Math.max(0, n - 1));
      void markNotificationReadAction(item.id).then(refreshCount);
    }
    setOpen(false);
    if (item.link) router.push(item.link);
  }

  function markAll() {
    setItems((prev) => prev?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? prev);
    setUnread(0);
    void markAllNotificationsReadAction().then(refreshCount);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? t("labelUnread", { count: unread }) : t("label")}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
      >
        {/* Bell */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold tabular-nums text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{t("label")}</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && items === null ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">{t("loading")}</p>
            ) : error ? (
              <p role="alert" className="px-3 py-8 text-center text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : !items || items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">{t("empty")}</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className={`flex w-full gap-2 border-b border-zinc-50 px-3 py-2.5 text-left transition last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900 ${
                        item.readAt ? "" : "bg-indigo-50/50 dark:bg-indigo-950/20"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          item.readAt ? "bg-transparent" : "bg-indigo-600"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">{item.body}</span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-zinc-400">
                          {new Date(item.createdAt).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
