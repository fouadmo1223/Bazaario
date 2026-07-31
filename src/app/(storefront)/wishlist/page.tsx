import type { Metadata } from "next";
import Link from "next/link";
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
  const items = await getWishlistView();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Your wishlist
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {items.length} {items.length === 1 ? "item" : "items"}
      </p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Nothing saved yet.</p>
          <p className="mt-1 text-xs text-zinc-400">
            Tap the heart on any product to keep it here.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Browse products
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
