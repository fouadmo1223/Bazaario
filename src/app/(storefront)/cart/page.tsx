import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Cart } from "@/server/database/models/cart.model";
import { Vendor } from "@/server/database/models/vendor.model";
import { connectToDatabase } from "@/server/database/connection";
import { getCurrentUser } from "@/server/security/current-user";
import { readGuestToken } from "@/server/security/guest-token";
import { formatMoney } from "@/shared/lib/format";

export const metadata: Metadata = {
  title: "Your cart · Commerce",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type VendorCart = {
  vendorName: string;
  vendorSlug: string;
  currency: string;
  itemCount: number;
  subtotal: number;
  items: { title: string; image: string | null; quantity: number; unitPrice: number }[];
};

/**
 * Marketplace cart overview.
 *
 * Carts are per-vendor because each store prices, ships, and fulfils its own
 * order — so this page is a directory of the shopper's open carts rather than
 * one basket. Checkout stays per vendor at `/v/{slug}/checkout`; combining them
 * would imply a single shipment and a single payment, which isn't what happens.
 */
async function loadCarts(): Promise<VendorCart[]> {
  const user = await getCurrentUser();
  const guestToken = user ? undefined : await readGuestToken();
  if (!user && !guestToken) return [];

  await connectToDatabase();
  const carts = await Cart.find(user ? { user: user.id } : { guestToken });
  const active = carts.filter((c) => c.items.length > 0);
  if (active.length === 0) return [];

  const vendors = await Vendor.find({ _id: { $in: active.map((c) => c.vendor) } });
  const vendorById = new Map(vendors.map((v) => [String(v._id), v]));

  const result: VendorCart[] = [];
  for (const cart of active) {
    const vendor = vendorById.get(String(cart.vendor));
    // A suspended vendor's cart is not checkout-able; hide it rather than
    // offering a button that would fail.
    if (!vendor || vendor.status !== "active") continue;

    result.push({
      vendorName: vendor.name,
      vendorSlug: vendor.slug,
      currency: vendor.settings.currency,
      itemCount: cart.items.reduce((n, i) => n + i.quantity, 0),
      subtotal: cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0),
      items: cart.items.map((i) => ({
        title: i.title,
        image: i.image ?? null,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
    });
  }
  return result;
}

export default async function GlobalCartPage() {
  const carts = await loadCarts();
  const total = carts.reduce((n, c) => n + c.itemCount, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Your cart
      </h1>
      {carts.length > 0 && (
        <p className="mt-1 text-sm text-zinc-500">
          {total} {total === 1 ? "item" : "items"} across {carts.length}{" "}
          {carts.length === 1 ? "store" : "stores"} · each store checks out separately
        </p>
      )}

      {carts.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
          <p className="text-sm text-zinc-500">Your cart is empty.</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {carts.map((cart) => (
            <section
              key={cart.vendorSlug}
              aria-label={`Cart at ${cart.vendorName}`}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <Link
                  href={`/v/${cart.vendorSlug}`}
                  className="text-sm font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100"
                >
                  {cart.vendorName}
                </Link>
                <span className="text-sm text-zinc-500">
                  {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
                </span>
              </header>

              <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-900">
                {cart.items.slice(0, 3).map((item, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                      {item.image ? (
                        <Image src={item.image} alt="" fill sizes="48px" className="object-cover" />
                      ) : null}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                      {item.quantity} × {item.title}
                    </p>
                    <span className="shrink-0 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                      {formatMoney(item.unitPrice * item.quantity, cart.currency)}
                    </span>
                  </li>
                ))}
                {cart.items.length > 3 && (
                  <li className="py-3 text-xs text-zinc-500">
                    + {cart.items.length - 3} more
                  </li>
                )}
              </ul>

              <footer className="flex items-center justify-between gap-4 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Subtotal{" "}
                  <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-50">
                    {formatMoney(cart.subtotal, cart.currency)}
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/v/${cart.vendorSlug}/cart`}
                    className="text-sm text-zinc-500 hover:underline"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/v/${cart.vendorSlug}/checkout`}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Checkout
                  </Link>
                </div>
              </footer>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
