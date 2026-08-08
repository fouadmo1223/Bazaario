import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { getWishlistView } from "@/features/wishlist/queries";
import { WishlistItem } from "@/features/wishlist/components/wishlist-item";

export const metadata: Metadata = {
  title: "Your wishlist · Bazaario",
  // Personal to the visitor and worthless to a crawler.
  robots: { index: false, follow: false },
};

// Per-visitor state read from a cookie — never cache it.
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const t = await getTranslations("Wishlist");
  const items = await getWishlistView();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-text-tertiary">{t("count", { count: items.length })}</p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border-default py-20 text-center">
          <p className="text-sm text-text-tertiary">{t("empty")}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t("emptyHint")}</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            {t("browseProducts")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
          {items.map((item) => (
            <WishlistItem key={item.productId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
