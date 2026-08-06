"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const LINK_HREFS = [
  "/dashboard",
  "/dashboard/products",
  "/dashboard/coupons",
  "/dashboard/banners",
  "/dashboard/orders",
  "/dashboard/deliveries",
  "/dashboard/messages",
] as const;

const LABEL_KEYS: Record<(typeof LINK_HREFS)[number], string> = {
  "/dashboard": "overview",
  "/dashboard/products": "products",
  "/dashboard/coupons": "coupons",
  "/dashboard/banners": "banners",
  "/dashboard/orders": "orders",
  "/dashboard/deliveries": "deliveries",
  "/dashboard/messages": "messages",
};

/** Dashboard navigation, marking the active section for assistive tech too. */
export function DashboardNav() {
  const t = useTranslations("Dashboard");
  const pathname = usePathname();

  return (
    <nav aria-label={t("title")}>
      <ul className="flex items-center gap-1">
        {LINK_HREFS.map((href) => {
          // "/dashboard" must not light up for "/dashboard/orders".
          const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                {t(LABEL_KEYS[href])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
