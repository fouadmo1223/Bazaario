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
      <div className="flex min-h-dvh flex-col bg-background">
        <Suspense fallback={<div className="h-14 border-b border-border-subtle" />}>
          <StorefrontHeader />
        </Suspense>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border-subtle">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <div className="flex flex-wrap justify-between gap-10">
              <div className="max-w-xs">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-brand font-display text-xs font-bold text-white">
                    B
                  </span>
                  <span className="text-sm font-semibold text-foreground">Bazaario</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-text-secondary">{t("tagline")}</p>
              </div>

              <nav aria-label="Footer">
                <h3 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">{t("shop")}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/products" className="text-text-secondary transition hover:text-foreground">
                      {t("products")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/categories" className="text-text-secondary transition hover:text-foreground">
                      {t("categories")}
                    </Link>
                  </li>
                </ul>
              </nav>

              <nav aria-label="Account footer">
                <h3 className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">{t("account")}</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/account/orders" className="text-text-secondary transition hover:text-foreground">
                      {t("orders")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/account/messages" className="text-text-secondary transition hover:text-foreground">
                      {t("messages")}
                    </Link>
                  </li>
                  <li>
                    <Link href="/account/wallet" className="text-text-secondary transition hover:text-foreground">
                      {t("wallet")}
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="mt-10 border-t border-border-subtle pt-6 text-sm text-text-tertiary">
              {t("copyright", { year: new Date().getFullYear() })}
            </div>
          </div>
        </footer>
      </div>
    </StorefrontProvider>
  );
}
