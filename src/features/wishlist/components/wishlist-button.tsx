"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toggleWishlistAction } from "../actions";
import { useStorefront } from "@/features/storefront/storefront-provider";
import { useLoginRedirect } from "@/shared/hooks/use-login-redirect";

/**
 * Heart toggle.
 *
 * Optimistic: saving is cheap, reversible, and has no stock or money
 * consequence, so showing the new state immediately is worth it. On failure the
 * heart snaps back and the error surfaces via `title` rather than shifting the
 * layout of whatever card it sits on.
 *
 * Saved state comes from `StorefrontProvider` when present, so the same product
 * shown twice (grid + quick view) can't disagree, and the header count moves with
 * the click. `initialSaved` is the fallback for standalone use.
 */
export function WishlistButton({
  productId,
  initialSaved = false,
  size = "md",
  className,
}: {
  productId: string;
  initialSaved?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = useTranslations("ProductDetail");
  const storefront = useStorefront();
  const redirectToLogin = useLoginRedirect();
  const [pending, startTransition] = useTransition();
  const [localSaved, setLocalSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);

  const saved = storefront ? storefront.isSaved(productId) : localSaved;

  function apply(next: boolean) {
    if (storefront) storefront.setSaved(productId, next);
    else setLocalSaved(next);
  }

  function toggle(e: React.MouseEvent) {
    // Cards place these beside a stretched link — don't follow it on click.
    e.preventDefault();
    e.stopPropagation();

    const next = !saved;
    apply(next);
    setError(null);

    startTransition(async () => {
      const result = await toggleWishlistAction({ productId });
      if (!result.ok) {
        apply(!next); // revert
        // Saving now needs an account. Send them to sign in rather than
        // showing an error they cannot act on from here.
        if (redirectToLogin(result)) return;
        setError(result.error.message);
        return;
      }
      apply(result.data.saved);
    });
  }

  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? t("removeFromWishlist") : t("saveToWishlist")}
      title={error ?? (saved ? t("removeFromWishlist") : t("saveToWishlist"))}
      className={`inline-flex ${box} items-center justify-center rounded-full border transition disabled:opacity-60 ${
        saved
          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/60"
          : "border-border-subtle bg-surface/90 text-text-tertiary hover:text-red-600/90"
      } ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill={saved ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        className={icon}
        aria-hidden
      >
        <path
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
