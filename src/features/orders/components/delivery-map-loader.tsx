"use client";

import dynamic from "next/dynamic";

/**
 * `leaflet` touches `window` at import time, so it can't run during SSR.
 * `next/dynamic`'s `ssr: false` is disallowed inside a Server Component, so
 * this tiny wrapper — which itself does nothing browser-specific at its own
 * module top level — is what the server page imports instead.
 */
export const DeliveryMap = dynamic(() => import("./delivery-map").then((m) => m.DeliveryMap), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />,
});
