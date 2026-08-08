import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { getCartView } from "@/features/cart/queries";
import { CartLineItem } from "@/features/cart/components/cart-line-item";
import { CouponForm } from "@/features/cart/components/coupon-form";
import { OrderSummary } from "@/features/cart/components/order-summary";
import { isAppError } from "@/shared/lib/errors";

type Params = { vendor: string };

export const metadata: Metadata = {
  title: "Your cart · Bazaario",
  // A cart is per-visitor and worthless to a crawler.
  robots: { index: false, follow: false },
};

// The cart is per-visitor state read from a cookie — never cache it.
export const dynamic = "force-dynamic";

export default async function CartPage({ params }: { params: Promise<Params> }) {
  const t = await getTranslations("Checkout");
  const tCart = await getTranslations("Cart");
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
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 text-sm text-text-secondary">
          <Link href={`/v/${vendorSlug}`} className="hover:text-brand">
            {vendor.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{t("cart")}</span>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{tCart("title")}</h1>

        {cart.items.length === 0 ? (
          <EmptyCart vendorSlug={vendorSlug} t={tCart} />
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
            <section className="lg:col-span-2" aria-label="Cart items">
              <ul className="divide-y divide-border-subtle border-y border-border-subtle">
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

              <p className="mt-4 text-sm text-text-secondary">{tCart("items", { count: cart.itemCount })}</p>
            </section>

            <aside className="lg:col-span-1" aria-label="Order summary">
              <div className="rounded-card border border-border-subtle p-5">
                <h2 className="text-sm font-semibold text-foreground">{t("summary")}</h2>

                <div className="mt-4">
                  <CouponForm vendorId={vendorId} vendorSlug={vendorSlug} applied={cart.coupon} />
                </div>

                <div className="mt-5 border-t border-border-subtle pt-5">
                  <OrderSummary totals={cart.totals} currency={cart.currency} />
                </div>

                <Link
                  href={`/v/${vendorSlug}/checkout`}
                  className="mt-6 block rounded-btn bg-brand px-6 py-3 text-center text-sm font-semibold text-white shadow-xs transition hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-sm"
                >
                  {t("checkout")}
                </Link>

                <Link
                  href={`/v/${vendorSlug}`}
                  className="mt-3 block text-center text-sm text-text-secondary underline-offset-4 hover:underline"
                >
                  {t("continueShopping")}
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCart({
  vendorSlug,
  t,
}: {
  vendorSlug: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <div className="mt-10 rounded-card border border-dashed border-border-default py-20 text-center">
      <p className="text-sm text-text-secondary">{t("empty")}</p>
      <Link
        href={`/v/${vendorSlug}`}
        className="mt-4 inline-block rounded-btn bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
      >
        {t("browseProducts")}
      </Link>
    </div>
  );
}
