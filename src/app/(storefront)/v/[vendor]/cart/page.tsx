import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { getCartView } from "@/features/cart/queries";
import { CartLineItem } from "@/features/cart/components/cart-line-item";
import { CouponForm } from "@/features/cart/components/coupon-form";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { isAppError } from "@/shared/lib/errors";

type Params = { vendor: string };

export const metadata: Metadata = {
  title: "Your cart · Commerce",
  // A cart is per-visitor and worthless to a crawler.
  robots: { index: false, follow: false },
};

// The cart is per-visitor state read from a cookie — never cache it.
export const dynamic = "force-dynamic";

export default async function CartPage({ params }: { params: Promise<Params> }) {
  const { vendor: vendorSlug } = await params;

  let vendor;
  try {
    vendor = await vendorService.getBySlug(vendorSlug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const vendorId = String(vendor._id);
  const cart = await getCartView(vendor);

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 text-sm text-zinc-500">
          <Link href={`/v/${vendorSlug}`} className="hover:text-indigo-600">
            {vendor.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Cart</span>
        </nav>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Your cart
        </h1>

        {cart.items.length === 0 ? (
          <EmptyCart vendorSlug={vendorSlug} />
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
            <section className="lg:col-span-2" aria-label="Cart items">
              <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {cart.items.map((line) => (
                  <CartLineItem
                    key={`${line.productId}:${line.variantId ?? ""}`}
                    line={line}
                    vendorId={vendorId}
                    vendorSlug={vendorSlug}
                    currency={cart.currency}
                  />
                ))}
              </ul>

              <p className="mt-4 text-sm text-zinc-500">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </p>
            </section>

            <aside className="lg:col-span-1" aria-label="Order summary">
              <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Summary</h2>

                <div className="mt-4">
                  <CouponForm vendorId={vendorId} vendorSlug={vendorSlug} applied={cart.coupon} />
                </div>

                <div className="mt-5 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                  <OrderSummary totals={cart.totals} currency={cart.currency} />
                </div>

                <Link
                  href={`/v/${vendorSlug}/checkout`}
                  className="mt-6 block rounded-lg bg-indigo-600 px-6 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Checkout
                </Link>

                <Link
                  href={`/v/${vendorSlug}`}
                  className="mt-3 block text-center text-sm text-zinc-500 underline-offset-4 hover:underline"
                >
                  Continue shopping
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCart({ vendorSlug }: { vendorSlug: string }) {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 py-20 text-center dark:border-zinc-800">
      <p className="text-sm text-zinc-500">Your cart is empty.</p>
      <Link
        href={`/v/${vendorSlug}`}
        className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
      >
        Browse products
      </Link>
    </div>
  );
}
