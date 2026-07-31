"use client";

import { useEffect } from "react";

/** Registers the offline-fallback service worker. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
