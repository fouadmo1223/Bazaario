import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DashboardNav } from "@/features/dashboard/components/dashboard-nav";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getCurrentUser } from "@/server/security/current-user";
import { notificationService } from "@/server/services/notification.service";

/**
 * Dashboard shell. Deliberately does not resolve the vendor itself — each page
 * does that, so a permission failure surfaces on the page rather than blanking
 * the whole chrome.
 *
 * It does resolve the *user*, which is a different question: the bell is
 * personal rather than vendor-scoped, and there is no `StorefrontProvider` here
 * to carry the unread count the way the storefront header does, so it is read
 * here and passed down. Cheap — a count on an indexed field, on routes that are
 * already dynamic. No user simply means no bell rather than an error, since the
 * proxy has already kept unauthenticated visitors out of `/dashboard`.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Dashboard");
  const user = await getCurrentUser();
  const unread = user ? await notificationService.unreadCount(user.id) : 0;

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            {t("title")}
          </Link>
          <div className="flex items-center gap-3">
            <DashboardNav />
            {user ? <NotificationBell initialUnread={unread} /> : null}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
