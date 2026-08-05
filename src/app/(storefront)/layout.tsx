import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { StorefrontHeader } from "@/features/storefront/components/storefront-header";
import { StorefrontProvider } from "@/features/storefront/storefront-provider";

/**
 * Shared marketplace chrome. A route group, so it wraps the storefront without
 * appearing in any URL — `/`, `/products`, and `/v/{vendor}` all keep their paths.
 *
 * `StorefrontProvider` holds the per-visitor state (cart/wishlist) and fetches it
 * on the client, which is what lets the pages below stay ISR-cached and shared.
 *
 * The header reads `useSearchParams`, which needs a Suspense boundary or it opts
 * every page below into client-side rendering.
 */
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Footer");

  return (
    <StorefrontProvider>
      <div className="flex min-h-dvh flex-col bg-white dark:bg-black">
        <Suspense fallback={<div className="h-14 border-b border-zinc-200 dark:border-zinc-800" />}>
          <StorefrontHeader />
        </Suspense>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-zinc-500">
            <p>{t("copyright", { year: new Date().getFullYear() })}</p>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-4">
                <li>
                  <Link href="/products" className="hover:text-zinc-900 dark:hover:text-zinc-200">
                    {t("products")}
                  </Link>
                </li>
                <li>
                  <Link href="/categories" className="hover:text-zinc-900 dark:hover:text-zinc-200">
                    {t("categories")}
                  </Link>
                </li>
                <li>
                  <Link href="/account/orders" className="hover:text-zinc-900 dark:hover:text-zinc-200">
                    {t("orders")}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </footer>
      </div>
    </StorefrontProvider>
  );
}
