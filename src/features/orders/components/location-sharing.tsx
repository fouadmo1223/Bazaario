"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useOrderTracking } from "@/shared/hooks/use-socket";

/**
 * The driver's side of live tracking: `watchPosition` fires on every
 * meaningful movement, each fix relayed straight through the socket — the
 * server re-verifies this caller is actually the assigned driver on every
 * emit, so there's nothing to gate client-side beyond the browser's own
 * permission prompt.
 */
export function LocationSharing({ orderId }: { orderId: string }) {
  const t = useTranslations("LocationSharing");
  const { shareLocation } = useOrderTracking(orderId);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  function start() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError(t("noGeoSupport"));
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => shareLocation(pos.coords.latitude, pos.coords.longitude),
      () => setError(t("permissionError")),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    setSharing(true);
  }

  function stop() {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setSharing(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={sharing ? stop : start}
        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
          sharing
            ? "border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
            : "bg-emerald-600 text-white hover:bg-emerald-500"
        }`}
      >
        {sharing ? t("stopSharing") : t("shareLocation")}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
