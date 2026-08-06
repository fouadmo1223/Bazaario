import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentUser, type CurrentUser } from "@/server/security/current-user";
import { ROLES } from "@/shared/constants/rbac";

/**
 * Super-admin gate for platform *pages*.
 *
 * Distinct from `requireSuperAdmin()`, which throws — right for actions and
 * route handlers, wrong for a page. A layout and its page render concurrently,
 * so a throwing page guard races the layout's redirect and logs an uncaught
 * UNAUTHORIZED even when the redirect is what the user gets. Redirecting from
 * both means whichever resolves first produces the same outcome.
 *
 * Pages still call this rather than leaning on the layout: a page that assumed
 * its layout had run would be one refactor away from being reachable alone.
 */
export async function requireSuperAdminPage(next = "/platform/vendors"): Promise<CurrentUser> {
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect({ href: `/login?next=${encodeURIComponent(next)}`, locale });
  if (!user.roles.includes(ROLES.SUPER_ADMIN)) redirect({ href: "/", locale });
  return user;
}
