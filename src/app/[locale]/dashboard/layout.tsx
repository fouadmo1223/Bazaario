import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { DashboardSidebar, DashboardMobileNav } from "@/features/dashboard/components/dashboard-nav";
import { VendorSwitcher } from "@/features/dashboard/components/vendor-switcher";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { getCurrentUser } from "@/server/security/current-user";
import { notificationService } from "@/server/services/notification.service";
import { listVendorOptions } from "@/features/platform/queries";
import { resolveActiveVendor } from "@/features/dashboard/resolve-vendor";
import { ROLES } from "@/shared/constants/rbac";

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
  const isSuperAdmin = user?.roles.includes(ROLES.SUPER_ADMIN) ?? false;
  const [vendors, activeVendorId] = isSuperAdmin
    ? await Promise.all([
        listVendorOptions(),
        resolveActiveVendor()
          .then((r) => String(r.vendor._id))
          .catch(() => null),
      ])
    : [null, null];

  return (
    <div className="flex min-h-dvh bg-background">
      <DashboardSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border-subtle">
          <div className="flex items-center justify-between gap-6 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <DashboardMobileNav />
              <Link href="/dashboard" className="text-sm font-semibold text-foreground lg:hidden">
                {t("title")}
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {isSuperAdmin && vendors && vendors.length > 0 ? (
                <VendorSwitcher vendors={vendors} activeId={activeVendorId ?? vendors[0].id} />
              ) : null}
              {user ? <NotificationBell initialUnread={unread} /> : null}
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
