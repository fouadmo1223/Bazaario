"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleWishlistAction } from "../actions";

/**
 * Heart toggle.
 *
 * Optimistic: saving is cheap, reversible, and has no stock or money
 * consequence, so showing the new state immediately is worth it. On failure the
 * heart snaps back and the error surfaces via `title` rather than shifting the
 * layout of whatever card it sits on.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);

  function toggle(e: React.MouseEvent) {
    // Cards wrap these in a link — don't navigate when the heart is clicked.
    e.preventDefault();
    e.stopPropagation();

    const next = !saved;
    setSaved(next);
    setError(null);

    startTransition(async () => {
      const result = await toggleWishlistAction({ productId });
      if (!result.ok) {
        setSaved(!next); // revert
        setError(result.error.message);
        return;
      }
      setSaved(result.data.saved);
      router.refresh();
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
      aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
      title={error ?? (saved ? "Remove from wishlist" : "Save to wishlist")}
      className={`inline-flex ${box} items-center justify-center rounded-full border transition disabled:opacity-60 ${
        saved
          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-900 dark:bg-red-950/60"
          : "border-zinc-200 bg-white/90 text-zinc-500 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900/90"
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
