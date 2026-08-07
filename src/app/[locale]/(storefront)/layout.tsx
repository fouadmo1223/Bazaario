import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
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
export default async function StorefrontLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Footer");

  return (
    <StorefrontProvider>
      <div className="flex min-h-dvh flex-col bg-white dark:bg-black">
        <Suspense fallback={<div className="h-14 border-b border-zinc-200 dark:border-zinc-800" />}>
          <StorefrontHeader />
        </Suspense>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <div className="flex flex-wrap justify-between gap-10">
              <div className="max-w-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-bold text-white">
                    B
                  </span>
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Bazaario</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-500">{t("tagline")}</p>
              </div>

              <nav aria-label="Footer">
                <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{t("shop")}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/products" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                      {t("products")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/categories" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                      {t("categories")}
                    </Link>
                  </li>
                </ul>
              </nav>

              <nav aria-label="Account footer">
                <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{t("account")}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/account/orders" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                      {t("orders")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/account/messages" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                      {t("messages")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/account/wallet" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200">
                      {t("wallet")}
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="mt-10 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
              {t("copyright", { year: new Date().getFullYear() })}
            </div>
          </div>
        </footer>
      </div>
    </StorefrontProvider>
  );
}
