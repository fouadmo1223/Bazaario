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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {t("title")}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">{t("count", { count: items.length })}</p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">{t("empty")}</p>
          <p className="mt-1 text-xs text-zinc-400">{t("emptyHint")}</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            {t("browseProducts")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map((item) => (
            <WishlistItem key={item.productId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
