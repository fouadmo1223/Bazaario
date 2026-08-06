"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "@/i18n/navigation";

type Snapshot = {
  cart: number;
  wishlist: number;
  wishlistIds: string[];
  notifications: number;
  signedIn: boolean;
};

type StorefrontState = {
  cartCount: number;
  wishlistCount: number;
  /** Unread notifications at the last fetch; the bell adds live arrivals on top. */
  notificationCount: number;
  /** Whether there is an account behind this visitor, not just a guest cookie. */
  signedIn: boolean;
  isSaved: (productId: string) => boolean;
  /** Reflect a toggle locally so every heart for that product agrees at once. */
  setSaved: (productId: string, saved: boolean) => void;
  refresh: () => void;
};

const StorefrontContext = createContext<StorefrontState | null>(null);

/**
 * Per-visitor storefront state (cart count, wishlist count, saved ids).
 *
 * Fetched once on the client rather than rendered on the server, so the pages
 * underneath stay ISR-cached and shared. Everything here is personal to the
 * visitor and cheap to fetch; the catalogue around it is not.
 */
export function StorefrontProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    cart: 0,
    wishlist: 0,
    wishlistIds: [],
    notifications: 0,
    signedIn: false,
  });
  const [nonce, setNonce] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/storefront/counts", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { ok: boolean; data?: Snapshot };
        if (body.ok && body.data) setSnapshot(body.data);
      } catch {
        // Offline or aborted — keep the last known state rather than blanking.
      }
    }

    void load();
    return () => controller.abort();
    // Refetch on navigation and whenever a mutation asks for a refresh.
  }, [pathname, nonce]);

  const savedIds = useMemo(() => new Set(snapshot.wishlistIds), [snapshot.wishlistIds]);

  const setSaved = useCallback((productId: string, saved: boolean) => {
    setSnapshot((prev) => {
      const ids = new Set(prev.wishlistIds);
      if (saved) ids.add(productId);
      else ids.delete(productId);
      const next = [...ids];
      return { ...prev, wishlist: next.length, wishlistIds: next };
    });
  }, []);

  const value = useMemo<StorefrontState>(
    () => ({
      cartCount: snapshot.cart,
      wishlistCount: snapshot.wishlist,
      notificationCount: snapshot.notifications,
      signedIn: snapshot.signedIn,
      isSaved: (id: string) => savedIds.has(id),
      setSaved,
      refresh: () => setNonce((n) => n + 1),
    }),
    [snapshot.cart, snapshot.wishlist, snapshot.notifications, snapshot.signedIn, savedIds, setSaved],
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

/**
 * Storefront state. Returns null outside the provider so components can still
 * render standalone (e.g. a product card in the dashboard) instead of throwing.
 */
export function useStorefront(): StorefrontState | null {
  return useContext(StorefrontContext);
}
