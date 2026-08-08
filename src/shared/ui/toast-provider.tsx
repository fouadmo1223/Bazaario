"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const Ctx = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, string> = {
  success: "border-success/30 bg-surface text-foreground before:bg-success",
  error: "border-error/30 bg-surface text-foreground before:bg-error",
  info: "border-info/30 bg-surface text-foreground before:bg-info",
};

let nextId = 0;

/**
 * Ephemeral, client-only action feedback ("Added to cart", "Coupon
 * applied") — distinct from `NotificationBell`, which is the persistent
 * server-backed per-user inbox. Mount once near the root; call `useToast()`
 * anywhere under it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:end-4 sm:inset-x-auto"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-btn border py-2.5 ps-4 pe-3 text-sm shadow-md before:absolute before:inset-y-0 before:start-0 before:w-1 ${TONE_STYLE[t.tone]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
