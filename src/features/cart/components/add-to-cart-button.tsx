"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { addToCartAction } from "../actions";
import { useLoginRedirect } from "@/shared/hooks/use-login-redirect";

/**
 * Adds a product to the cart from the storefront.
 *
 * Stock is checked again server-side by the cart service, so `disabled` here is
 * a convenience for the shopper rather than an enforcement point — a sold-out
 * item that slips past this button is still rejected on the server.
 */
export function AddToCartButton({
  vendorId,
  vendorSlug,
  productId,
  variantId,
  disabled = false,
  label,
  soldOutLabel,
  className,
}: {
  vendorId: string;
  vendorSlug: string;
  productId: string;
  variantId?: string;
  disabled?: boolean;
  label?: string;
  soldOutLabel?: string;
  className?: string;
}) {
  const t = useTranslations("ProductDetail");
  const router = useRouter();
  const redirectToLogin = useLoginRedirect();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  function onClick() {
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(vendorId, vendorSlug, {
        productId,
        variantId,
        quantity: 1,
      });

      if (!result.ok) {
        // A cart now needs an account. Send them to sign in and back, rather
        // than showing an error they cannot act on from a product card.
        if (redirectToLogin(result)) return;
        setError(result.error.message);
        return;
      }

      setAdded(true);
      // Refresh so the header count and cart page reflect the new line.
      router.refresh();
      setTimeout(() => setAdded(false), 2000);
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        aria-busy={pending}
        className="w-full rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled
          ? (soldOutLabel ?? t("soldOut"))
          : pending
            ? t("adding")
            : added
              ? t("added")
              : (label ?? t("addToCart"))}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
