"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Cart link with a live item count.
 *
 * The count is fetched client-side on purpose: the storefront pages it sits on
 * are ISR-cached and shared between visitors, so the per-visitor number cannot
 * come from their HTML. It refetches on navigation to stay in step with adds.
 */
export function CartBadge({ vendorId, vendorSlug }: { vendorId: string; vendorSlug: string }) {
  const [count, setCount] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch(`/api/cart/count?vendorId=${vendorId}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok: boolean; data?: { count: number } };
        if (body.ok && body.data) setCount(body.data.count);
      } catch {
        // Offline or aborted — the badge just stays quiet rather than erroring.
      }
    }

    void load();
    return () => controller.abort();
  }, [vendorId, pathname]);

  return (
    <Link
      href={`/v/${vendorSlug}/cart`}
      className="relative inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      Cart
      {count != null && count > 0 && (
        <span
          aria-label={`${count} ${count === 1 ? "item" : "items"} in cart`}
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
