import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { vendorService } from "@/server/services/vendor.service";
import { getCartView } from "@/features/cart/queries";
import { getCurrentUser } from "@/server/security/current-user";
import { quoteShippingMethods } from "@/server/services/shipping.service";
import { enabledProviders } from "@/server/payments/registry";
import { walletService } from "@/server/services/wallet.service";
import { formatMoney } from "@/shared/lib/format";
import { OrderSummary } from "@/features/cart/components/order-summary";
import {
  CheckoutForm,
  type PaymentOption,
} from "@/features/checkout/components/checkout-form";
import { isAppError } from "@/shared/lib/errors";
import type { VendorDoc } from "@/server/database/models/vendor.model";

type Params = { vendor: string };

export const metadata: Metadata = {
  title: "Checkout · Bazaario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAYMENT_COPY: Record<Exclude<PaymentOption["id"], "wallet">, Omit<PaymentOption, "id">> = {
  cod: { label: "Cash on delivery", description: "Pay the courier when your order arrives" },
  stripe: { label: "Card", description: "Pay securely by card" },
  paymob: { label: "Paymob", description: "Cards and wallets via Paymob" },
};

/**
 * A provider is offered only when the vendor has switched it on *and* the
 * deployment has credentials for it. Either alone would surface a method that
 * fails the moment the shopper picks it.
 *
 * Wallet is the exception to both: it's platform-wide (no vendor setting to
 * flip on), and it's offered only when this specific customer actually has a
 * balance — a `walletBalance` of 0 doesn't just disable it, it's left off the
 * list entirely, since the form has no "disabled option" state to render.
 */
function availablePayments(vendor: VendorDoc, walletBalance: number, currency: string): PaymentOption[] {
  const configured = new Set(enabledProviders());
  const settings = vendor.settings;

  const wanted: Exclude<PaymentOption["id"], "wallet">[] = [];
  if (settings.codEnabled) wanted.push("cod");
  if (settings.stripeEnabled) wanted.push("stripe");
  if (settings.paymobEnabled) wanted.push("paymob");

  const options: PaymentOption[] = wanted
    .filter((id) => configured.has(id))
    .map((id) => ({ id, ...PAYMENT_COPY[id] }));

  if (configured.has("wallet") && walletBalance > 0) {
    options.unshift({
      id: "wallet",
      label: "Wallet",
      description: "Pay from your store credit balance",
      trailing: formatMoney(walletBalance, currency),
    });
  }

  return options;
}

export default async function CheckoutPage({ params }: { params: Promise<Params> }) {
  const { vendor: vendorSlug } = await params;

  let vendor;
  try {
    vendor = await vendorService.getBySlug(vendorSlug);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const cart = await getCartView(vendor);
  // Nothing to check out — send them back rather than showing an empty form.
  if (cart.items.length === 0) redirect(`/v/${vendorSlug}/cart`);

  const user = await getCurrentUser();
  const walletBalance = user ? await walletService.getBalance(user.id) : 0;
  const shippingOptions = quoteShippingMethods(cart.totals.subtotal);
  const paymentOptions = availablePayments(vendor, walletBalance, cart.currency);

  return (
    <div className="min-h-dvh bg-white dark:bg-black">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <nav className="mb-6 text-sm text-zinc-500">
          <Link href={`/v/${vendorSlug}`} className="hover:text-indigo-600">
            {vendor.name}
          </Link>
          <span className="mx-2">/</span>
          <Link href={`/v/${vendorSlug}/cart`} className="hover:text-indigo-600">
            Cart
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">Checkout</span>
        </nav>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Checkout
        </h1>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {paymentOptions.length === 0 ? (
              <p
                role="alert"
                className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                This store has no payment method available right now. Please try again later.
              </p>
            ) : (
              <CheckoutForm
                vendorId={String(vendor._id)}
                vendorSlug={vendorSlug}
                currency={cart.currency}
                shippingOptions={shippingOptions}
                paymentOptions={paymentOptions}
                isAuthenticated={Boolean(user)}
              />
            )}
          </div>

          <aside className="lg:col-span-1" aria-label="Order summary">
            <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </h2>

              <ul className="mt-4 space-y-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
                {cart.items.map((line) => (
                  <li
                    key={`${line.productId}:${line.variantId ?? ""}`}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400">
                      {line.quantity} × {line.title}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                {/* Shipping is quoted per method; the total here excludes it until the
                    order is placed and the chosen method is priced server-side. */}
                <OrderSummary totals={cart.totals} currency={cart.currency} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
