"use client";

import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const LINK_HREFS = [
  "/dashboard",
  "/dashboard/products",
  "/dashboard/categories",
  "/dashboard/coupons",
  "/dashboard/banners",
  "/dashboard/orders",
  "/dashboard/deliveries",
  "/dashboard/messages",
  "/dashboard/settings",
] as const;

const LABEL_KEYS: Record<(typeof LINK_HREFS)[number], string> = {
  "/dashboard": "overview",
  "/dashboard/products": "products",
  "/dashboard/categories": "categories",
  "/dashboard/coupons": "coupons",
  "/dashboard/banners": "banners",
  "/dashboard/orders": "orders",
  "/dashboard/deliveries": "deliveries",
  "/dashboard/messages": "messages",
  "/dashboard/settings": "settings",
};

/**
 * Dashboard navigation, marking the active section for assistive tech too.
 *
 * Nine sections no longer fit a single row below `sm` (the storefront header
 * hit the same wall), so below that breakpoint this collapses to a menu
 * button opening a dropdown instead of wrapping or scrolling the header.
 */
export function DashboardNav() {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the dropdown in response to a route change, not derivable from props/state during render.
  useEffect(() => setOpen(false), [pathname]);

  function isActive(href: string) {
    // "/dashboard" must not light up for "/dashboard/orders".
    return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
  }

  return (
    <>
      <nav aria-label={t("title")} className="hidden sm:block">
        <ul className="flex items-center gap-1">
          {LINK_HREFS.map((href) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(href)
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                {t(LABEL_KEYS[href])}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div ref={rootRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="dashboard-mobile-nav"
          aria-label={t("title")}
          className="flex items-center justify-center rounded-lg p-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        {open && (
          <nav
            id="dashboard-mobile-nav"
            aria-label={t("title")}
            className="absolute end-0 top-full z-40 mt-2 w-48 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
          >
            <ul>
              {LINK_HREFS.map((href) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(href) ? "page" : undefined}
                    className={`block px-4 py-2.5 text-sm font-medium transition ${
                      isActive(href)
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                        : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                  >
                    {t(LABEL_KEYS[href])}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </>
  );
}
