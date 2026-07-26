import Link from "next/link";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getCurrentUser } from "@/server/security/current-user";
import { notificationService } from "@/server/services/notification.service";

/**
 * Account shell.
 *
 * These pages previously had no shared chrome at all, which left two holes: a
 * shopper who followed a notification into `/account/messages/{id}` lost the
 * bell that brought them there, and once inside the account area there was no
 * way back to the storefront except each page's own contextual back link.
 *
 * Deliberately thin — a link home and the bell. The pages below already carry
 * their own headings and back links, and the profile page is where the account's
 * own navigation lives; duplicating that here would give the section two
 * competing menus.
 *
 * The count is resolved here for the same reason as the dashboard: this is
 * outside `StorefrontProvider`, so there is nothing to carry it. No user means
 * no bell rather than an error — the proxy already keeps anonymous visitors out
 * of `/account`.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const unread = user ? await notificationService.unreadCount(user.id) : 0;

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <header className="border-b border-zinc-200 print:hidden dark:border-zinc-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-6 px-6 py-4">
          <Link
            href="/"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Commerce
          </Link>
          {user ? <NotificationBell initialUnread={unread} /> : null}
        </div>
      </header>
      {children}
    </div>
  );
}
