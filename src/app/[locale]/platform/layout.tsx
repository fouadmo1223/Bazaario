import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireSuperAdminPage } from "@/features/platform/guard";

/**
 * Platform console shell — Super Admin only.
 *
 * The guard here is what stops the console *rendering* for anyone else. It is
 * not what protects the mutations: every action calls `requireSuperAdmin()`
 * itself, because a server action is reachable by direct POST and a layout that
 * declined to render is no obstacle to that.
 *
 * Redirects rather than 403s, so a signed-in customer who follows a stale link
 * lands somewhere useful instead of on a wall.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPage();
  const t = await getTranslations("PlatformLayout");

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/platform/vendors" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {t("platform")}
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/platform/vendors" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              {t("vendorsAndStaff")}
            </Link>
            <Link href="/" className="transition hover:text-zinc-900 dark:hover:text-zinc-100">
              {t("storefront")}
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
