import { requireUser } from "@/server/security/current-user";
import { notificationService } from "@/server/services/notification.service";
import { json, route } from "@/shared/lib/api-response";

/**
 * The signed-in user's recent notifications, for the bell's dropdown.
 *
 * Separate from `/api/storefront/counts` (which carries only the unread number)
 * so the chrome does not ship every title and body on every navigation — this is
 * fetched when the bell is actually opened.
 *
 * Scoped by `requireUser`, and the service filters on `user` — a notification is
 * personal, so there is no id a caller could pass to read someone else's.
 */
export const GET = route(async () => {
  const user = await requireUser();

  const [page, unread] = await Promise.all([
    notificationService.list(user.id, { limit: "20" }),
    notificationService.unreadCount(user.id),
  ]);

  return json({
    unread,
    items: page.items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
});

// Per-user and changes constantly; never cache it.
export const dynamic = "force-dynamic";
