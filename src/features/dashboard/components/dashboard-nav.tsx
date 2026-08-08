"use client";

import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Package,
  Tags,
  Ticket,
  Image as ImageIcon,
  ShoppingBag,
  Truck,
  MessageSquare,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

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

const ICONS: Record<(typeof LINK_HREFS)[number], LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/products": Package,
  "/dashboard/categories": Tags,
  "/dashboard/coupons": Ticket,
  "/dashboard/banners": ImageIcon,
  "/dashboard/orders": ShoppingBag,
  "/dashboard/deliveries": Truck,
  "/dashboard/messages": MessageSquare,
  "/dashboard/settings": Settings,
};

function isActivePath(pathname: string, href: string) {
  // "/dashboard" must not light up for "/dashboard/orders".
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

/**
 * Desktop dashboard navigation: a collapsible left sidebar (icon-only when
 * collapsed) rather than the horizontal bar this replaced — nine sections no
 * longer fit one row, and a sidebar scales past that without a second
 * navigation pattern.
 */
export function DashboardSidebar() {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border-subtle bg-surface transition-[width] lg:flex ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex h-16 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/dashboard" className="font-display text-sm font-semibold text-foreground">
            Bazaario
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? t("expandNav") : t("collapseNav")}
          className={`flex h-8 w-8 items-center justify-center rounded-btn text-text-tertiary transition hover:bg-surface-raised hover:text-foreground ${collapsed ? "mx-auto" : ""}`}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav aria-label={t("title")} className="flex-1 space-y-0.5 px-3 py-2">
        {LINK_HREFS.map((href) => {
          const Icon = ICONS[href];
          const active = isActivePath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? t(LABEL_KEYS[href]) : undefined}
              className={`flex items-center gap-3 rounded-btn px-3 py-2 text-sm font-medium transition ${
                active ? "bg-brand/10 text-brand" : "text-text-secondary hover:bg-surface-raised hover:text-foreground"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{t(LABEL_KEYS[href])}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile equivalent: a menu button in the top bar opening the same link list. */
export function DashboardMobileNav() {
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

  return (
    <div ref={rootRef} className="relative lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="dashboard-mobile-nav"
        aria-label={t("title")}
        className="flex items-center justify-center rounded-btn p-2 text-text-secondary transition hover:bg-surface-raised hover:text-foreground"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {open && (
        <nav
          id="dashboard-mobile-nav"
          aria-label={t("title")}
          className="absolute start-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-card border border-border-subtle bg-surface py-1 shadow-sm"
        >
          <ul>
            {LINK_HREFS.map((href) => {
              const Icon = ICONS[href];
              const active = isActivePath(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition ${
                      active ? "bg-brand/10 text-brand" : "text-text-secondary hover:bg-surface-raised"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    {t(LABEL_KEYS[href])}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
