import { redirect } from "next/navigation";
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
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!user.roles.includes(ROLES.SUPER_ADMIN)) redirect("/");
  return user;
}
